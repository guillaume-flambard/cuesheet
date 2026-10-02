/** Owner check policy is carried by the pinned oracle bytes, never model input. */
import {cpSync,mkdtempSync,readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,relative} from 'node:path';
import {ContainerToolRunner} from './container-tools.ts';
import {readCapture,digestDirectory,type CapturedArtifact} from './artifact-capture.ts';
import type {Verification} from '../verify.ts';
export interface CapsuleCheckProfile {executor:'container';image:string;outputs:string[];temporaryStorage?:"volume"|"tmpfs";}
const prefix='// cuesheet-check-v1: ';
export function capsuleCheckProfile(script:Buffer):CapsuleCheckProfile|undefined{
 const line=script.toString('utf8').split('\n',1)[0]!.trimStart();
 if(!line.startsWith('// cuesheet-check-'))return undefined;
 if(!line.startsWith(prefix))throw Error('Invalid owner capsule check profile.');
 let d:any;try{d=JSON.parse(line.slice(prefix.length));}catch{throw Error('Invalid owner capsule check profile.');}
 if(!d||Array.isArray(d)||d.executor!=='container'||typeof d.image!=='string'||!/^(?:sha256:|[a-z0-9][a-z0-9./:_-]*@sha256:)[a-f0-9]{64}$/.test(d.image)||Object.keys(d).some(k=>!['executor','image','outputs','temporaryStorage'].includes(k))||!Array.isArray(d.outputs)||d.outputs.length>16||new Set(d.outputs).size!==d.outputs.length)throw Error('Invalid owner capsule check profile.');
 if(d.temporaryStorage!==undefined&&!['volume','tmpfs'].includes(d.temporaryStorage))throw Error('Invalid owner capsule temporary storage.');
 for(const path of d.outputs){if(typeof path!=='string'||path.length>120||!/^[-A-Za-z0-9_.]+(?:\/[-A-Za-z0-9_.]+)*$/.test(path)||path.split('/').some(p=>p==='.'||p==='..'||['.git','.cuesheet','node_modules','.npmrc','.pypirc'].includes(p)||p==='.env'||p.startsWith('.env.')))throw Error('Invalid owner capsule check output path.');}
 return Object.freeze({executor:'container',image:d.image,outputs:Object.freeze(d.outputs.slice()),...(d.temporaryStorage===undefined?{}:{temporaryStorage:d.temporaryStorage})}) as CapsuleCheckProfile;
}
function assertNodes(root:string,outputs:readonly string[],dir=root):string[]{
 const files:string[]=[];
 for(const name of readdirSync(dir)){
  const path=join(dir,name),rel=relative(root,path).split('\\').join('/');
  if(outputs.some(p=>rel===p||rel.startsWith(p+'/'))||['node_modules','.npm','.git','.DS_Store','.npmrc','.pypirc'].includes(name)||name==='.env'||name.startsWith('.env.'))continue;
  const node=lstatSync(path);if(node.isDirectory())files.push(...assertNodes(root,outputs,path));else if(!node.isFile()||node.nlink>1)throw Error('Uncovered scratch inode change.');else files.push(rel);
 }
 return files;
}
export async function runCapsuleCheck(options:{artifact:CapturedArtifact;script:Buffer;profile:CapsuleCheckProfile;socket:string;root:string;checkDigest:string;timeoutMs?:number;signal?:AbortSignal}):Promise<Verification>{
 const {artifact,profile}=options,target={effectId:artifact.producerEffectId,artifactDigest:artifact.digest};
 const inconclusive=(reason:string):Verification=>({target,verdict:'INCONCLUSIVE',evidence:[{kind:'target_digest',value:artifact.digest},{kind:'actual_digest',value:reason}]});
 if(readCapture(artifact).kind!=='ok')return inconclusive('Captured input unavailable before capsule check.');
 let cleanupConfirmed=false;
 const root=mkdtempSync(join(options.root,'capsule-')),scratch=join(root,'scratch'),receipts=join(root,'containers.jsonl');
 const append=(data:unknown)=>writeFileSync(receipts,JSON.stringify({effectId:artifact.producerEffectId,artifactDigest:artifact.digest,checkDigest:options.checkDigest,...data as object})+'\n',{flag:'a',mode:0o600});
 try{
  cpSync(artifact.location,scratch,{recursive:true});const beforeFiles=new Map(assertNodes(scratch,profile.outputs).map(path=>[path,createHash("sha256").update(readFileSync(join(scratch,path))).digest("hex")]));const before=digestDirectory(scratch,profile.outputs).digest;
  const bytes=options.script.toString('utf8');
  const runner=new ContainerToolRunner({allow:['node'],roots:[scratch],defaultCwd:scratch,socket:options.socket,image:profile.image,timeoutMs:options.timeoutMs??120000,temporaryStorage:profile.temporaryStorage,outputBytes:1024*1024,
   onAdmission:name=>append({phase:'admitted',name,image:profile.image,scope:scratch,temporaryStorage:profile.temporaryStorage??"tmpfs"}),onCleanup:(name,removed)=>{append({phase:'cleanup',name,removed});cleanupConfirmed=removed;}});
  const result=await runner.run({name:'node',input:{argv:['node','--input-type=module','-e',bytes]}},options.signal);
  append({phase:'result',exit:result.exit});
  writeFileSync(join(root,'oracle-output.log'),result.output,{mode:0o600});
  const afterFiles=new Map(assertNodes(scratch,profile.outputs).map(path=>[path,createHash("sha256").update(readFileSync(join(scratch,path))).digest("hex")]));
  const changed=[...new Set([...beforeFiles.keys(),...afterFiles.keys()])].filter(path=>beforeFiles.get(path)!==afterFiles.get(path));
  if(changed.length)append({phase:"protected-source-changed",paths:changed.slice(0,20),count:changed.length});
  if(readCapture(artifact).kind!=='ok'||digestDirectory(scratch,profile.outputs).digest!==before)return inconclusive(`Captured input or protected scratch source changed during capsule check: ${changed.slice(0,8).join(", ")}.`);
  if(!cleanupConfirmed||result.exit===null||[126,137].includes(result.exit)||options.signal?.aborted)return inconclusive('Capsule oracle execution unavailable or unconfirmed; inspect attributed resource receipts.');
  return {target,verdict:result.exit===0?'VERIFIED':'REJECTED',evidence:[{kind:'target_digest',value:artifact.digest},{kind:'actual_digest',value:`exit ${result.exit} in owner image ${profile.image}; derived outputs: ${profile.outputs.join(',')||'none'}; receipts ${receipts}`}]};
 }catch{return inconclusive('Capsule check failed; captured input retained, inspect attributed scratch/resources.');}
}

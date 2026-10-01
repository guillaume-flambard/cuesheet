/** Local, owner-configured Docker Engine execution; no model-supplied daemon policy. */
import {request as httpRequest} from "node:http";
import {randomUUID} from "node:crypto";
import {existsSync,mkdtempSync,mkdirSync,realpathSync,rmSync,statSync,writeFileSync,lstatSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute,join,resolve,dirname,basename} from "node:path";
import type {ToolRequest,ToolResult} from "../core/loop.ts";
import {ShellToolRunner} from "./shell.ts";

export interface ContainerToolOptions {
  allow:string[];roots:string[];defaultCwd:string;
  /** Local Unix socket only; remote daemons must never receive local bind paths. */
  socket:string;
  /** Immutable local image identifier. The runner never pulls or logs in. */
  image:string;
  protectedPaths?:string[];
  timeoutMs?:number;outputBytes?:number;
  onAdmission?:(name:string,request:ToolRequest)=>void;
  onCleanup?:(name:string,removed:boolean)=>void;
}
const API="/v1.51";
const imageValid=(image:string)=>/^sha256:[a-f0-9]{64}$/.test(image)||/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(image);
const under=(path:string,root:string)=>path===root||path.startsWith(root+"/");
type Reply={status:number;body:Buffer};
function engine(socket:string,path:string,method="GET",body?:unknown,signal?:AbortSignal,timeoutMs=5000,maxBytes=2*1024*1024):Promise<Reply>{
  return new Promise((resolvePromise,reject)=>{
    const encoded=body===undefined?undefined:Buffer.from(JSON.stringify(body));
    const req=httpRequest({socketPath:socket,path,method,signal,agent:false,headers:encoded?{"content-type":"application/json","content-length":encoded.length}:undefined},res=>{
      const chunks:Buffer[]=[];let bytes=0;
      res.on("data",(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>maxBytes){req.destroy(new Error("Engine response exceeds its limit."));return;}chunks.push(chunk);});
      res.on("end",()=>resolvePromise({status:res.statusCode??0,body:Buffer.concat(chunks)}));res.on("error",reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error("Engine operation timed out.")),Math.max(1,timeoutMs));
    req.on("close",()=>clearTimeout(timer));req.on("error",reject);req.end(encoded);
  });
}
function json(reply:Reply,expected:number):Record<string,unknown>{
  if(reply.status!==expected)throw new Error("Engine operation refused.");
  const value:unknown=JSON.parse(reply.body.toString("utf8"));
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid Engine response.");
  return value as Record<string,unknown>;
}
/** Docker non-TTY multiplexing: validate all frames, preserve only the output tail. */
export function containerOutput(body:Buffer,limit:number):string{
  let at=0,tail=Buffer.alloc(0);
  while(at<body.length){
    if(body.length-at<8 || ![0,1,2].includes(body[at]!) || body[at+1]!==0 || body[at+2]!==0 || body[at+3]!==0)throw new Error("Invalid container output frame.");
    const size=body.readUInt32BE(at+4);at+=8;
    if(size>1024*1024 || at+size>body.length)throw new Error("Incomplete container output frame.");
    tail=Buffer.concat([tail,body.subarray(at,at+size)]).subarray(-limit);at+=size;
  }
  return tail.toString("utf8");
}
/** Fail closed on host inode aliases and IPC exposed by a writable bind. */
export function inspectContainerRoots(roots:readonly string[],masked:readonly string[]):void{
  let count=0;const pending=[...roots];
  while(pending.length){
    const path=pending.pop()!;if(masked.some(mask=>under(path,mask)))continue;
    if(++count>100000)throw new Error("Workspace inspection exceeds its limit.");
    const item=lstatSync(path);
    if(item.isSymbolicLink())continue;
    if(item.isDirectory()){for(const child of readdirSync(path))pending.push(join(path,child));}
    else if(!item.isFile()||item.nlink>1)throw new Error("Workspace exposes a special file or hardlink.");
  }
}
export class ContainerToolRunner {
  readonly policy:string;
  readonly names:readonly string[];
  private readonly options:ContainerToolOptions;
  private readonly admission:ShellToolRunner;
  constructor(options:ContainerToolOptions){
    if(!isAbsolute(options.socket)||/[\0\r\n]/.test(options.socket)||!imageValid(options.image))throw new Error("Container tools require a local Unix socket and immutable image digest.");
    const timeoutMs=options.timeoutMs??120000,outputBytes=options.outputBytes??8000;
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>3600000||!Number.isSafeInteger(outputBytes)||outputBytes<1||outputBytes>1024*1024)throw new Error("Invalid container tool limits.");
    this.names=Object.freeze(options.allow.slice());
    this.options={...options,roots:options.roots.slice(),allow:options.allow.slice(),protectedPaths:options.protectedPaths?.slice(),timeoutMs,outputBytes};
    this.admission=new ShellToolRunner({allow:this.options.allow,roots:this.options.roots,defaultCwd:options.defaultCwd});
    this.policy=`Conteneur Linux déclaré (${options.image}) : réseau absent, contrôle masqué ; commandes selon les binaires de l’image.`;
  }
  async run(request:ToolRequest,signal?:AbortSignal):Promise<ToolResult>{
    const prepared=this.admission.prepare(request);if(!("argv" in prepared))return prepared;
    if(signal?.aborted)return {name:request.name,exit:null,output:"Container tool cancelled before creation."};
    const name="cuesheet-tool-"+randomUUID();const deadline=AbortSignal.timeout(this.options.timeoutMs!);
    const abort=signal?AbortSignal.any([signal,deadline]):deadline;
    let maskRoot:string|undefined,attemptedCreate=false,admitted=false,createConfirmed=false;
    let result:ToolResult={name:request.name,exit:null,output:"Container tool not confirmed."};
    try{
      const version=json(await engine(this.options.socket,"/version","GET",undefined,abort),200);
      const apiMinor=(value:unknown)=>typeof value==="string"&&/^1\.\d+$/.test(value)?Number(value.split(".")[1]):-1;
      if(version.Os!=="linux"||apiMinor(version.ApiVersion)<51||apiMinor(version.MinAPIVersion)>51)throw new Error("Unsupported Engine platform or API.");
      const roots=[...new Set(this.options.roots.map(root=>realpathSync(resolve(root))))];
      const cwd=realpathSync(prepared.cwd);
      if(!roots.some(root=>under(cwd,root)))throw new Error("Working directory escapes canonical roots.");
      maskRoot=mkdtempSync(join(tmpdir(),"cuesheet-tool-mask-"));
      const empty=join(maskRoot,"empty");mkdirSync(empty);const blank=join(maskRoot,"blank");writeFileSync(blank,"");
      type Mount={Type:"bind";Source:string;Target:string;ReadOnly:boolean;BindOptions:{Propagation:"rprivate";NonRecursive:true}};
      const mount=(source:string,target:string,readonly:boolean):Mount=>({Type:"bind",Source:source,Target:target,ReadOnly:readonly,BindOptions:{Propagation:"rprivate",NonRecursive:true}});
      const mounts:Mount[]=roots.map(root=>mount(root,root,false));
      const masks=new Map<string,boolean>();
      for(const root of roots){const control=join(root,".cuesheet");if(!existsSync(control))mkdirSync(control,{mode:0o700});if(!lstatSync(control).isDirectory())throw new Error("Control mount must be a directory, never a symlink.");masks.set(control,true);}
      for(const protectedPath of this.options.protectedPaths??[]){
        const lexical=resolve(protectedPath);if(!existsSync(lexical))continue;
        const target=join(realpathSync(dirname(lexical)),basename(lexical));
        if(roots.some(root=>under(target,root))){
          if(lstatSync(lexical).isSymbolicLink())throw new Error("Protected mount cannot be a symlink.");
          const path=realpathSync(lexical);if(!roots.some(root=>under(path,root)))throw new Error("Protected mount changed its scope.");
          masks.set(path,statSync(path).isDirectory());
        }
      }
      // Parent masks already hide their descendants; avoid mounting host data.
      for(const [path,directory] of masks)if(![...masks.keys()].some(parent=>parent!==path&&under(path,parent)))mounts.push(mount(directory?empty:blank,path,true));
      inspectContainerRoots(roots,[...masks.keys()]);
      const timeoutSeconds=Math.max(0.001,this.options.timeoutMs!/1000).toString()+"s";
      const uid=process.getuid?.()||1000,gid=process.getgid?.()||1000;
      const body={Image:this.options.image,Entrypoint:["/usr/bin/timeout","--signal=KILL",timeoutSeconds],Cmd:prepared.argv,WorkingDir:cwd,User:`${uid}:${gid}`,Tty:false,
        Env:["HOME=/tmp","TMPDIR=/tmp","NO_COLOR=1"],Labels:{"io.cuesheet.tool":"v1"},
        HostConfig:{ReadonlyRootfs:true,NetworkMode:"none",CapDrop:["ALL"],SecurityOpt:["no-new-privileges:true"],Memory:1024*1024*1024,NanoCpus:2000000000,PidsLimit:128,
          Mounts:mounts,Tmpfs:{"/tmp":"rw,nosuid,nodev,size=134217728"},LogConfig:{Type:"json-file",Config:{"max-size":"1m","max-file":"1"}},RestartPolicy:{Name:"no"}}};
      this.options.onAdmission?.(name,request);admitted=true;
      attemptedCreate=true;
      const created=json(await engine(this.options.socket,API+"/containers/create?name="+encodeURIComponent(name),"POST",body,abort),201);
      if(typeof created.Id!=="string"||!/^[a-f0-9]{64}$/.test(created.Id))throw new Error("Invalid container identity.");
      createConfirmed=true;
      const path=API+"/containers/"+encodeURIComponent(name);
      const start=await engine(this.options.socket,path+"/start","POST",undefined,abort);if(start.status!==204)throw new Error("Container start refused.");
      const wait=json(await engine(this.options.socket,path+"/wait?condition=not-running","POST",undefined,abort,this.options.timeoutMs!),200);
      if(!Number.isSafeInteger(wait.StatusCode)||Number(wait.StatusCode)<0||Number(wait.StatusCode)>255||wait.Error)throw new Error("Container completion not confirmed.");
      const logs=await engine(this.options.socket,path+"/logs?stdout=1&stderr=1","GET",undefined,abort);
      if(logs.status!==200)throw new Error("Container logs unavailable.");
      const output=containerOutput(logs.body,this.options.outputBytes!);
      result={name:request.name,exit:[124,137].includes(Number(wait.StatusCode))?null:Number(wait.StatusCode),output};
    }catch{
      result={name:request.name,exit:null,output:abort.aborted?"Container tool interrupted before confirmed completion.":"Container tool not confirmed: verify the local Engine, pinned image, mounts and required binaries."};
    }finally{
      let cleaned=!attemptedCreate;
      if(attemptedCreate)try{const removal=await engine(this.options.socket,API+"/containers/"+encodeURIComponent(name)+"?force=1","DELETE");cleaned=createConfirmed&&(removal.status===204||removal.status===404);}catch{}
      if(admitted)try{this.options.onCleanup?.(name,cleaned);}catch{result={name:request.name,exit:null,output:"Container cleanup receipt not persisted for "+name};}
      if(cleaned){if(maskRoot)try{rmSync(maskRoot,{recursive:true,force:true});}catch{result={name:request.name,exit:null,output:"Container mask cleanup not confirmed for "+name};}}
      else result={name:request.name,exit:null,output:result.output+"\nCleanup not confirmed for owned container "+name+"; inspect it before further effects."};
    }
    return result;
  }
}

/** Dependency aliases are admitted by the owner-selected immutable image, never a tool request. */
export const NODE_CAPSULE_LABEL='io.cuesheet.node-capsule';
export const NODE_CAPSULE_ROOT='/opt/cuesheet-deps/node_modules';
export function derivedCapsuleAlias(path:string,target:string):boolean {
 const parts=path.split(/[\\/]/);return target===NODE_CAPSULE_ROOT&&(parts.length===1&&parts[0]==='node_modules'||parts.length===3&&['apps','packages'].includes(parts[0]!)&&!['.','..'].includes(parts[1]!)&&parts[2]==='node_modules');
}
export function nodeCapsule(labels:unknown):boolean {
 if(labels===undefined||labels===null)return false;
 if(typeof labels!=='object'||Array.isArray(labels))throw Error('Invalid image labels.');
 const value=(labels as Record<string,unknown>)[NODE_CAPSULE_LABEL];
 if(value===undefined)return false;
 if(value!=='node-v1')throw Error('Unsupported dependency capsule.');
 return true;
}
/** Fixed image-local dependency path. Existing workspace resources are never replaced. */
export const NODE_CAPSULE_BOOTSTRAP=`const fs=require('fs'),cp=require('child_process');
const created=[];
try {
 const root=${JSON.stringify(NODE_CAPSULE_ROOT)},path=require('path'),cwd=fs.realpathSync('.'),targets=['node_modules'];
 if(!fs.statSync(root).isDirectory())throw Error('Dependency capsule missing');
 for(const folder of ['apps','packages']) {
  let children;try{children=fs.readdirSync(folder,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(children.length>64)throw Error('Workspace package limit exceeded');
  for(const child of children){if(!child.isDirectory())continue;const dir=path.join(folder,child.name),absolute=fs.realpathSync(dir);if(!absolute.startsWith(cwd+path.sep))throw Error('Workspace package escaped');let manifest;try{manifest=fs.lstatSync(path.join(dir,'package.json'));}catch(e){if(e.code==='ENOENT')continue;throw e;}if(!manifest.isFile()||manifest.isSymbolicLink())throw Error('Workspace manifest refused');targets.push(path.join(dir,'node_modules'));}
 }
 const absent=[];
 for(const target of targets){try {const existing=fs.lstatSync(target);if(!existing.isSymbolicLink()||fs.readlinkSync(target)!==root)throw Error('Existing dependencies require inspection');}
 catch(e){if(e.code!=='ENOENT')throw e;absent.push(target);}}
 for(const target of absent){fs.symlinkSync(root,target,'dir');created.push(target);}
} catch {console.error('Dependency capsule refused; existing workspace dependencies preserved.');process.exit(126);}
const command=process.argv.slice(1);const result=cp.spawnSync(command[0],command.slice(1),{stdio:'inherit'});
for(const target of created){try{fs.unlinkSync(target);}catch{}}
if(result.error){console.error('Capsule command unavailable.');process.exit(126);}process.exit(result.status??137);`;

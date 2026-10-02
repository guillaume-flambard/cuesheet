import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {parseStateGraph,type StateGraph} from './schema.ts';
import type {ChangeKind,PathChange} from './impact.ts';
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const hash=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
/** Project-defined deterministic encoding; declarations are not execution authority. */
export function graphRevision(graph:StateGraph):string{
 // Revalidate public inputs rather than trusting a TypeScript cast.
 const validated=parseStateGraph(JSON.stringify(graph));
 const nodes=validated.nodes.map(node=>({...node,
  sourceRefs:[...node.sourceRefs].sort((a,b)=>compare(a.path,b.path)),
  contractRefs:[...node.contractRefs].sort(compare),invariantRefs:[...node.invariantRefs].sort(compare),checkRefs:[...node.checkRefs].sort(compare)})).sort((a,b)=>compare(a.id,b.id));
 const edges=[...validated.edges].sort((a,b)=>compare(a.id,b.id));
 return hash(JSON.stringify({version:1,nodes,edges}));
}
export async function loadStateGraph(ownerRoot:string):Promise<{graph:StateGraph;revision:string;manifestDigest:string;path:string;root:string}>{
 const root=await realpath(ownerRoot);let path=root;
 // `.cuesheet` is the container runner's reserved control mount: it bind-mounts an
  // empty directory over it so a model-driven tool cannot read runner control state.
  // Project state cannot live there or every capsule check would see no manifest.
  for(const part of ['.cuesheet-project']){path=join(path,part);const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(path)!==path)throw Error('State graph manifest parent is redirected.');}
 path=join(path,'graph.json');const stat=await lstat(path);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>2*1024*1024)throw Error('State graph requires a bounded regular owner manifest.');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=await handle.stat();if(opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error('Manifest changed before read.');
  const bytes=Buffer.alloc(stat.size+1),read=await handle.read(bytes,0,bytes.length,0),after=await handle.stat(),latest=await lstat(path);
  if(read.bytesRead!==stat.size||after.size!==stat.size||after.nlink!==1||latest.nlink!==1||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||latest.ino!==stat.ino||latest.dev!==stat.dev||await realpath(path)!==path)throw Error('Manifest changed during read.');
  const content=bytes.subarray(0,read.bytesRead),text=content.toString('utf8');if(!Buffer.from(text,'utf8').equals(content))throw Error('Manifest is not valid UTF-8.');
  const graph=parseStateGraph(text);return Object.freeze({graph,revision:graphRevision(graph),manifestDigest:hash(content),path,root});
 }finally{await handle.close();}
}

/** Bounded so a huge diff is refused rather than buffered, matching the manifest's own size ceiling. */
const MAX_DIFF_BYTES=2*1024*1024;
/**
 * Git is asked for names only, never for content. A path is all the impact mapping needs, and a diff that
 * carried file bodies would be a second, larger, unvalidated read of the owner tree.
 *
 * The child sees an environment assembled by naming, never the developer's: a diff reader is the last
 * place a provider key should be able to travel from the parent into a subprocess.
 */
async function gitNames(root:string,args:readonly string[]):Promise<string>{
 const env={PATH:process.env.PATH??'/usr/bin:/bin',LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'};
 return new Promise((accept,reject)=>{
  const child=execFile('git',['--no-pager','-c','core.fsmonitor=false',...args],{cwd:root,env,encoding:'utf8',maxBuffer:MAX_DIFF_BYTES,timeout:10000},(error,out)=>error?reject(Error('Change set could not be read from the owner repository.')):accept(out));
  child.stdin?.end();
 });
}
/** `git diff --name-status -z` letters, mapped to the change vocabulary. Anything else is refused, not guessed. */
const KINDS:Readonly<Record<string,ChangeKind>>=Object.freeze({A:'added',M:'modified',D:'deleted',T:'modified'});
/**
 * Parse a NUL-separated `--name-status` stream.
 *
 * The separator is NUL, not newline, and that is a correctness requirement rather than a parsing taste:
 * git quotes a path containing a newline, a quote or a non-ASCII byte when it separates records with
 * newlines, and a quoted path is a string that matches no declaration in the graph. The path would then
 * read as unmapped, the plan would honestly report incomplete coverage, and the real change would sit
 * outside it. `-z` disables the quoting, so the bytes between separators are the path.
 *
 * `R` and `C` carry two paths, in that order, and the second is the current name.
 */
function parseNameStatus(stream:string):PathChange[]{
 const fields=stream.split('\0'),out:PathChange[]=[];
 for(let i=0;i<fields.length;){
  const status=fields[i++]!;
  if(status==='')continue;
  const letter=status[0]!;
  if(letter==='R'||letter==='C'){
   const from=fields[i++],path=fields[i++];
   if(from===undefined||path===undefined)throw Error('Change set ended inside a rename record.');
   out.push(Object.freeze({path,kind:'renamed',from}));
   continue;
  }
  const kind=KINDS[letter];
  if(kind===undefined)throw Error(`Change set holds an unreadable status: ${status}.`);
  const path=fields[i++];
  if(path===undefined)throw Error('Change set ended inside a path record.');
  out.push(Object.freeze({path,kind}));
 }
 return out;
}
/** Ordinal sort over the whole record, so two runs of the same diff produce the same array byte for byte. */
const orderChange=(a:PathChange,b:PathChange)=>compare(a.path,b.path)||compare(a.from??'',b.from??'');
/**
 * Read a change set from the owner repository: the working tree against `base`, plus any untracked file.
 *
 * Untracked files are included because they are the change a developer has made and not yet committed, and
 * a mapping that only ever saw commits would report complete coverage over a tree it had never looked at.
 *
 * Paths are returned as git states them, relative and slash-separated. They are not resolved against the
 * filesystem here on purpose: a deleted path has nothing to resolve against, and resolving only the paths
 * that still exist is precisely how a deletion gets dropped.
 */
export async function readChangeSet(root:string,base='HEAD'):Promise<readonly PathChange[]>{
 const args=['diff','--name-status','-z','--no-ext-diff','--no-textconv',base,'--'];
 const tracked=parseNameStatus(await gitNames(root,args));
 const untracked=parseNameStatus((await gitNames(root,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean).map(path=>`A\0${path}`).join('\0'));
 const unique=new Map<string,PathChange>();
 // A path can appear as untracked and then be staged; the later, committed reading of it is the truer one,
 // so tracked wins over untracked for the same path and the deletion record is never overwritten by an add.
 for(const change of [...untracked,...tracked])unique.set(`${change.from??''}\0${change.path}`,change);
 return Object.freeze([...unique.values()].sort(orderChange));
}

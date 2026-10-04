/** Static compilation reads isolated sources and owner-installed dependencies; no project scripts run. */
import {execFile} from 'node:child_process';
import {existsSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import type {ToolRequest,ToolResult,ToolRunner} from '../core/loop.ts';
/** Controller-owned source, never selected by a worker proposal. */
export function withStaticTypecheck(runner:ToolRunner,options:{workspace:string;source:string;signal?:AbortSignal}):ToolRunner&{names:readonly string[]}{
 const names=(runner as ToolRunner&{names?:readonly string[]}).names??[];
 return {names:[...new Set([...names,'check_types'])],run:request=>request.name==='check_types'?staticTypecheck(request,options):runner.run(request)};
}
const WORKER=String.raw`
const fs=require('fs'),path=require('path');
let input='';process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{
 try{
 const {source,workspace,project,compiler}=JSON.parse(input),ts=require(compiler);
 const within=(p,r)=>p===r||p.startsWith(r+path.sep);
 const map=p=>{p=path.resolve(p);if(!within(p,source))throw Error('Compiler read outside project dependencies.');const rel=path.relative(source,p);const target=path.resolve(workspace,rel);const dependency=rel.split(path.sep).includes('node_modules');const candidate=dependency?p:target;
 if(fs.existsSync(candidate)&&!within(fs.realpathSync(candidate),dependency?source:workspace))throw Error('Compiler path escapes its declared scope.');return candidate;};
 const safe=(fn,fallback)=>(p,...a)=>{try{return fn(map(p),...a);}catch{return fallback;}};
 const system={...ts.sys,readFile:safe(ts.sys.readFile,undefined),fileExists:safe(ts.sys.fileExists,false),directoryExists:safe(ts.sys.directoryExists,false),getDirectories:safe(ts.sys.getDirectories,[]),readDirectory:(p,...a)=>{try{return ts.sys.readDirectory(map(p),...a).map(file=>path.resolve(source,path.relative(workspace,file)));}catch{return [];}}};
 const config=ts.readConfigFile(path.resolve(source,project),system.readFile);if(config.error){console.log(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));process.exitCode=2;return;}
 const parsed=ts.parseJsonConfigFileContent(config.config,system,path.dirname(path.resolve(source,project)),{noEmit:true});
 Object.assign(ts.sys,system);
 const host=ts.createCompilerHost(parsed.options);host.writeFile=()=>{throw Error('Static check cannot emit files.');};

 const program=ts.createProgram(parsed.fileNames,parsed.options,host),diagnostics=[...parsed.errors,...ts.getPreEmitDiagnostics(program)];
 console.log(diagnostics.length?ts.formatDiagnostics(diagnostics,{getCanonicalFileName:p=>path.relative(source,p),getCurrentDirectory:()=>source,getNewLine:()=> '\n'}):'TypeScript passed: '+parsed.fileNames.length+' source files checked; no files emitted.');process.exitCode=diagnostics.length?2:0;
 }catch(e){console.log('Static check refused: '+e.message);process.exitCode=126;}
});`;
export function staticTypecheck(request:ToolRequest,options:{workspace:string;source:string;signal?:AbortSignal}):Promise<ToolResult>{
 const name=request.name,project=request.input.project;
 if(typeof project!=='string'||!project.endsWith('.json')||project.includes('\0')||project.includes('node_modules')||project.includes('..')||resolve(options.workspace,project)!==join(resolve(options.workspace),project))return Promise.resolve({name,exit:126,output:'Use check_types {project:relative tsconfig path}.'});
 const source=realpathSync(options.source),workspace=realpathSync(options.workspace),config=resolve(workspace,project);
 try{if(!realpathSync(config).startsWith(workspace+sep))throw Error();}catch{return Promise.resolve({name,exit:126,output:'Scoped TypeScript config is missing or escapes the workspace.'});}
 const local=join(source,dirname(project),'node_modules','typescript','lib','typescript.js');const compiler=existsSync(local)?local:join(source,'node_modules','typescript','lib','typescript.js');if(!existsSync(compiler))return Promise.resolve({name,exit:126,output:'Owner-installed TypeScript is unavailable. No package installation was attempted.'});
 return new Promise(done=>{const child=execFile(process.execPath,['-e',WORKER],{cwd:workspace,env:{PATH:process.env.PATH??'',HOME:workspace},timeout:30000,maxBuffer:1024*1024,signal:options.signal},(error,stdout,stderr)=>done({name,exit:error?typeof error.code==='number'?error.code:options.signal?.aborted?null:126:0,output:(stdout||stderr||error?.message||'').slice(0,16000)}));child.stdin?.end(JSON.stringify({source,workspace,project,compiler}));});
}

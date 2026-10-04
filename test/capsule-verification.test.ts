import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,writeFileSync,readFileSync,rmSync,realpathSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {allocateWorktree} from '../src/adapters/managed-worktrees.ts';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {capsuleCheckProfile} from '../src/adapters/capsule-verification.ts';
import {createCompletionCheck} from '../src/adapters/surface-verification.ts';
import {verifyCapture} from '../src/adapters/artifact-capture.ts';
import {captureGitSnapshot,snapshotMatches} from '../src/adapters/git-snapshot.ts';
const image=process.env.CUESHEET_TEST_CAPSULE_IMAGE!,socket=process.env.CUESHEET_TEST_TOOL_SOCKET!;
const profile=(outputs:string[]=[],temporaryStorage?:"volume"|"tmpfs")=>'// cuesheet-check-v1: '+JSON.stringify({executor:'container',image:image||'sha256:'+'a'.repeat(64),outputs,...(temporaryStorage===undefined?{}:{temporaryStorage})})+'\n';
const available=!!image&&!!socket;
test('owner capsule profile is strictly pinned and invalid capabilities/output paths refuse',()=>{
 assert.equal(capsuleCheckProfile(Buffer.from('process.exit(0)')),undefined);
 const good={executor:'container',image:'sha256:'+'a'.repeat(64),outputs:['dist','.typecheck.log']};assert.deepEqual(capsuleCheckProfile(Buffer.from('// cuesheet-check-v1: '+JSON.stringify(good))),good);
 for(const change of [{image:'node:latest'},{executor:'local'},{outputs:['../source']},{outputs:['.']},{outputs:['.git/config']},{outputs:['node_modules']},{outputs:['.env']},{outputs:['.cuesheet']},{outputs:['dist','dist']},{socket:'/model/socket'},{temporaryStorage:'host'},{temporaryStorage:0},{outputs:Array(17).fill('dist')}])assert.throws(()=>capsuleCheckProfile(Buffer.from('// cuesheet-check-v1: '+JSON.stringify({...good,...change}))),/Invalid owner/);
 assert.throws(()=>capsuleCheckProfile(Buffer.from('// cuesheet-check-v1: nope')),/Invalid owner/);
 assert.throws(()=>capsuleCheckProfile(Buffer.from('// cuesheet-check-v2: {}')),/Invalid owner/);
 assert.deepEqual(capsuleCheckProfile(Buffer.from('\ufeff  // cuesheet-check-v1: '+JSON.stringify(good))),good);
 const root=mkdtempSync(join(tmpdir(),'cs-check-profile-'));try{const script=join(root,'owner.mjs');writeFileSync(script,profile()+'process.exit(0)');assert.throws(()=>createCompletionCheck({script,root:join(root,'proof')}),/socket/);}finally{rmSync(root,{recursive:true,force:true});}
});
test('actual capsule oracle permits admitted derived build outputs and rejects protected source mutation',{skip:!available},async()=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),'cs-capsule-check-'))),workspace=join(root,'work');mkdirSync(workspace);writeFileSync(join(workspace,'source.txt'),'owner input');
 try{for(const [body,outputs,verdict] of [
  ["import {writeFileSync,mkdirSync} from 'node:fs';import ts from 'typescript';if(!ts.version)process.exit(1);mkdirSync('dist',{recursive:true});writeFileSync('dist/result','derived');",['dist'],'VERIFIED'],
  ["import {writeFileSync} from 'node:fs';writeFileSync('source.txt','changed');",[],'INCONCLUSIVE'],
  ["process.exit(1)",[],'REJECTED'],
  ["await new Promise(r=>setTimeout(r,10000))",[],'INCONCLUSIVE']
 ] as const){const script=join(root,'oracle-'+Math.random()+'.mjs');writeFileSync(script,profile([...outputs])+body);const check=createCompletionCheck({script,root:join(root,'proof'),containerSocket:socket,timeoutMs:body.includes('10000')?1000:30000});const result=await check.verify(workspace,'E-fixture');assert.equal(result.verification.verdict,verdict,JSON.stringify(result));assert.ok(verifyCapture(result.artifact));assert.equal(readFileSync(join(workspace,'source.txt'),'utf8'),'owner input');}
 const oracle=join(root,'denied.mjs');writeFileSync(oracle,profile()+'process.exit(0)');const denied=createCompletionCheck({script:oracle,root:join(root,'proof'),containerSocket:join(root,'absent.sock')});assert.equal((await denied.verify(workspace,'E-denied')).verification.verdict,'INCONCLUSIVE');
 const pinned=createCompletionCheck({script:oracle,root:join(root,'proof'),containerSocket:socket});chmodSync(pinned.pinned!.script,0o600);writeFileSync(pinned.pinned!.script,'process.exit(0)');assert.equal((await pinned.verify(workspace,'E-tamper')).verification.verdict,'INCONCLUSIVE');
 }finally{rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
test('independent owner capsule builds and checks captured Cuesheet without mutating source or artifact',{skip:!available},async()=>{
 const source=realpathSync(process.cwd()),root=realpathSync(mkdtempSync(join(tmpdir(),'cs-owner-selfhost-')));let workspace:string|undefined;try{
 const baselineDiagnostics=readFileSync(join(source,'.typecheck.log'),'utf8').split('\n').filter(line=>/error TS/.test(line));const before=await captureGitSnapshot(source),script=join(root,'owner.mjs');
 const allocated=await allocateWorktree({repository:source,root:join(root,'workspaces'),allocation:{id:'owner-check',unit:'independent-check',agent:'fixture-verifier',objective:'selfhost-oracle',revision:1,base:before.base},snapshot:before});assert.equal(allocated.kind,'ready',JSON.stringify(allocated));if(allocated.kind!=='ready')return;workspace=allocated.path;
 writeFileSync(script,profile(['dist','.typecheck.log'],'volume')+`import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const build=spawnSync('bash',['scripts/build.sh'],{stdio:'inherit'});assert.equal(build.status,0);assert.deepEqual(readFileSync('.typecheck.log','utf8').split('\\n').filter(line=>/error TS/.test(line)),${JSON.stringify(baselineDiagnostics)});
const tests=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-skip-pattern=MB-01 a real run against the installed binary','--test-reporter=spec','test/**/*.test.ts'],{stdio:'inherit'});assert.equal(tests.status,0);`);
 const check=createCompletionCheck({script,root:join(root,'proof'),containerSocket:socket,timeoutMs:300000});const result=await check.verify(workspace,'E-selfhost');
 const diagnostics=readdirSync(join(root,'proof'),{recursive:true}).filter(p=>String(p).endsWith('oracle-output.log')).map(p=>readFileSync(join(root,'proof',String(p)),'utf8')).join('\n');
 assert.equal(result.verification.verdict,'VERIFIED',diagnostics+'\n'+JSON.stringify(result.verification));assert.ok(verifyCapture(result.artifact));assert.ok(await snapshotMatches(before,source));console.log('independent capsule Cuesheet build/tests: '+diagnostics.slice(-1000));
 }finally{if(workspace)execFileSync('git',['-c','core.hooksPath=/dev/null','worktree','remove','--force',workspace],{cwd:source,stdio:'pipe',env:{PATH:process.env.PATH!,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

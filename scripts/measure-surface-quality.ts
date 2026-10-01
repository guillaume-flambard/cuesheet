/** Opt-in live acceptance measurement. Keeps inputs and proofs for inspection. */
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BinaryModelAdapter,type StepUsage} from '../src/adapters/binary-model.ts';
import {findBinary} from '../src/adapters/default-model.ts';
import {createCompletionCheck} from '../src/adapters/surface-verification.ts';
import {ShellToolRunner} from '../src/adapters/shell.ts';
import {createProducer} from '../apps/terminal/src/producer/index.ts';
import {createStore} from '../apps/terminal/src/app/store.ts';

if (!process.argv.includes('--live')) {
  console.error('Usage: node scripts/measure-surface-quality.ts --live (runs the configured local model)');
  process.exit(2);
}
const binary=findBinary();
if (!binary) throw new Error('No local model binary installed');
const root=mkdtempSync(join(tmpdir(),'cuesheet-quality-live-'));
const cwd=join(root,'work');mkdirSync(cwd);
writeFileSync(join(cwd,'sum.mjs'),'export const sum = values => values.reduce((a,b)=>a+b);\n');
const oracle=join(root,'check.mjs');
writeFileSync(oracle,`import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const {sum}=await import(pathToFileURL(join(process.cwd(),'sum.mjs')).href);
assert.equal(sum([]),0);assert.equal(sum([2,3]),5);assert.equal(sum([-3,1]),-2);
assert.equal(sum([0]),0);assert.equal(sum([1.5,2.25]),3.75);`);
const adapter=new BinaryModelAdapter({binary,project:cwd,timeoutMs:45000,...(process.env.CUESHEET_MODEL?{model:process.env.CUESHEET_MODEL}:{})});
const store=createStore();const steps:{step:number;usage:StepUsage[];elapsedMs:number}[]=[];
let calls=0;
const producer=createProducer({store,cwd,identities:[],projectsRoot:root,toolNames:['cat','node'],
  tools:new ShellToolRunner({allow:['cat','node'],roots:[cwd],defaultCwd:cwd}),
  verification:createCompletionCheck({script:oracle,root:join(root,'proof')}),
  model:{name:adapter.name,async infer(frame){
    if(++calls>4)throw new Error('live measurement exhausted its four-inference budget');
    const start=Date.now();const response=await adapter.infer(frame);
    const step={step:frame.step,usage:response.usage,elapsedMs:Date.now()-start};steps.push(step);
    console.log(JSON.stringify(step));return response;
  }}
});
const goal='Fix sum.mjs: sum([]) currently throws and must return 0. Preserve numeric addition for non-empty arrays. Read the current file, make the smallest correction, and request finish with empty input to run the owner acceptance check. Shell tools use input.argv including the executable name.';
producer.say(goal);
while(store.get().busy)await new Promise(resolve=>setTimeout(resolve,100));
const result={goal,root,steps,verified:store.get().log.filter(row=>row.startsWith('[work_verified]')),
  evidence:store.get().log.filter(row=>row.startsWith('[evidence]')),log:store.get().log,entries:store.get().entries};
writeFileSync(join(root,'measurement.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({root,steps,accepted:result.evidence.length>0}));
if(!result.evidence.length)process.exitCode=1;

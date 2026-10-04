import {it} from 'node:test';
import assert from 'node:assert/strict';
import {EventStore} from '../src/core/store.ts';
import {createObjective,correctObjective} from '../src/adapters/objectives.ts';
import {projectWorkSurface} from '../apps/terminal/src/producer/work-surface.ts';

it('surface keeps human intent and rejects plans invalidated by live steering',()=>{
 const store=new EventStore('surface',()=>1);
 const source=store.append({kind:'goal',subject:'human',data:{text:'Inspect IntentLane and Kollio'}});
 const objective=createObjective(store,'Inspect IntentLane and Kollio','',source.seq);
 const seq=store.revision+1;
 store.append({kind:'note',subject:'terminal.work',data:{version:1,operation:'plan',id:'plan-1',revision:seq,phase:'research',rationale:'Inspect the impact',spec:null,tasks:['Inspect IntentLane'],taskRecords:[{id:'task-1',text:'Inspect IntentLane',expected:'Impact established',dependencies:[],revision:seq}],objectiveId:objective.id,objectiveRevision:objective.revision,against:store.revision}});
 assert.equal(projectWorkSurface(store.toSession().events).tasks.length,1);
 const correction=store.append({kind:'directive',subject:'human',data:{text:'Leave Kollio'}});
 correctObjective(store,'Leave Kollio',correction.seq);
 const result=projectWorkSurface(store.toSession().events);
 assert.equal(result.intent,'Inspect IntentLane and Kollio');
 assert.deepEqual(result.corrections,['Leave Kollio']);
 assert.deepEqual(result.tasks,[],'historical plan cannot impersonate current work');
});

it('surface never upgrades consultant results into proof and restored running agents are interrupted',()=>{
 const events:any[]=[{seq:1,at:1,kind:'note',subject:'terminal.agent',data:{version:1,id:'agent-1',role:'review',task:'Inspect contract',model:'test',phase:'active',execution:'run-1'}},{seq:2,at:1,kind:'note',subject:'terminal.agent',data:{version:1,id:'agent-2',role:'review',task:'Inspect contract',model:'test',phase:'result',text:'Looks good'}}];
 const surface=projectWorkSurface(events);
 assert.equal(surface.workers.find(w=>w.id==='agent-1')?.phase,'interrupted');
 assert.equal(surface.workers.find(w=>w.id==='agent-2')?.phase,'result');
 assert.deepEqual(projectWorkSurface([]),{intent:null,corrections:[],tasks:[],workers:[]});
});

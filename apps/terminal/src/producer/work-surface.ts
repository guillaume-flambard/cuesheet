import {projectWorkObjects} from './work-objects.ts';
import {projectAssistance} from '../../../../src/adapters/agent-assistance.ts';
import type {Event} from '../../../../src/core/store.ts';
import {projectObjectives} from '../../../../src/adapters/objectives.ts';
import {projectWorkPlans} from '../../../../src/adapters/work-plans.ts';
import {projectAgents} from '../../../../src/adapters/agent-consultation.ts';

import type {WorkSurface} from '../app/state.ts';
export type {WorkSurface} from '../app/state.ts';

export function projectWorkSurface(events:readonly Event[],live:boolean|string=false):WorkSurface {
  const assistance=new Map(projectAssistance(events,live).map(a=>[a.helperId,a]));
  const objective=projectObjectives(events).current;
  const plans=projectWorkPlans(events);
  const current=[...plans.values()].reverse().find(plan=>{
    const source=events.find(event=>event.seq===plan.revision);
    return objective && plan.objectiveId===objective.id && source?.data.objectiveRevision===objective.revision;
  });
  const surface:WorkSurface={
    intent:objective?.originalText ?? null,
    corrections:objective?.corrections.map(c=>c.text) ?? [],
    tasks:current?.tasks.map(t=>({id:t.id,text:t.text})) ?? [],
    workers:projectAgents([...events],live).filter(a=>{
      const source=events.find(e=>e.seq===a.seq);
      return objective ? source?.data.objectiveId===objective.id && source.data.objectiveRevision===objective.revision : source?.data.objectiveId===undefined;
    }).map(a=>({id:a.id,label:`A${events.find(e=>e.subject==='terminal.agent'&&e.data.id===a.id)?.seq??a.seq}`,role:a.role,task:a.task,phase:a.phase,model:a.model,result:a.text,source:a.seq,...(assistance.has(a.id)?{helping:assistance.get(a.id)!.requesterId,routeReason:assistance.get(a.id)!.routeReason,assistancePhase:assistance.get(a.id)!.phase}:{})})),
  };
  if(objective){surface.criteria=objective.criteria;surface.objects=projectWorkObjects(events,objective,current,surface.workers);}
  return surface;
}

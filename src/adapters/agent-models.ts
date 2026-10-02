/** Session routes are owner choices; model requests cannot authorize providers. */
import type {Event} from '../core/store.ts';
import {validatePreferences,type ModelPreferences} from './model-preferences.ts';
export const AGENT_MODEL_SUBJECT='terminal.agent-model';
export function validAgentRole(role:string):boolean{return role==='*'||/^[a-z][a-z0-9-]{0,47}$/.test(role);}
export function projectAgentModels(events:Event[]):Map<string,ModelPreferences|null>{
 const routes=new Map<string,ModelPreferences|null>();let count=0;
 for(const event of events){if(event.subject!==AGENT_MODEL_SUBJECT)continue;const d=event.data;
  if(++count>1000||event.kind!=='note'||d.version!==1||d.author!=='human'||typeof d.role!=='string'||!validAgentRole(d.role))throw new Error('Agent model route journal is invalid.');
  if(d.selection===null){routes.set(d.role,null);continue;}
  const selection=validatePreferences(d.selection);if(!selection.provider||JSON.stringify(selection)!==JSON.stringify(d.selection))throw new Error('Agent route requires explicit clean owner preferences.');routes.set(d.role,selection);
  if(routes.size>30)throw new Error('Too many agent model routes.');
 }
 return routes;
}
export function agentSelection(routes:Map<string,ModelPreferences|null>,role:string):ModelPreferences|null{return routes.get(role)??routes.get('*')??null;}

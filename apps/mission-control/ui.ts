import {App} from '@modelcontextprotocol/ext-apps';
import type {Mission} from './projection.ts';
const app=new App({name:'Cuesheet Mission Control',version:'0.1.0'},{},{autoResize:true});
const el=(id:string)=>document.getElementById(id)!;
let mission:Mission|null=null,refreshing=false,alive=true,view='card';
const label=(value:string)=>value.replaceAll('-',' ').replaceAll('_',' ');
function text(tag:string,value:string,klass?:string){const node=document.createElement(tag);node.textContent=value;if(klass)node.className=klass;return node;}
function rows(parent:HTMLElement,title:string,items:Array<{title:string;state:string;subtitle?:string}>){
  parent.append(text('h3',title));if(!items.length){parent.append(text('p','No recorded data.','muted'));return;}
  for(const item of items){const row=text('div','','row'),body=text('div',item.title);if(item.subtitle)body.append(text('small',item.subtitle));row.append(body,text('span',label(item.state)));parent.append(row);}
}
function render(){
  if(!mission)return;const m=mission;
  el('project').textContent=m.project;el('objective').textContent=m.objective;
  el('status').textContent=label(m.state);el('status').className='status '+(m.state==='human_required'?'attention':m.state==='verified'?'verified':'');
  el('action').textContent=m.humanDelta.required?'Your action is required. '+m.humanDelta.reason:m.state==='running'?'No action required. Cuesheet is working.':m.state==='verified'?'The current objective has an independent verification receipt.':'The objective is open. Inspect its evidence before continuing.';
  el('action').className=m.humanDelta.required?'notice':'muted';el('phase').textContent='Current activity: '+label(m.currentPhase);
  el('facts').replaceChildren(text('span',m.workers.active+' active workers'),text('span',m.evidence.verified+' verified checks'),text('span',m.resources.elapsed===null?'Elapsed: unknown':m.resources.elapsed+'s elapsed'),text('span',m.resources.tokens===null?'Tokens: unknown':m.resources.tokens+' observed tokens'),text('span','Cost: unknown'));
  if(m.detail.failures.length||m.detail.pending.length)el('facts').append(text('span',m.detail.failures.length+' failed tools / '+m.detail.pending.length+' uncertain executions. Inspect before continuing.'));
  const inspector=el('inspector');inspector.replaceChildren();
  rows(inspector,'Execution graph',m.detail.graph.map(t=>({title:t.text,state:t.state,subtitle:t.dependencies.length?'Depends on '+t.dependencies.join(', '):undefined})));
  rows(inspector,'Workers',m.detail.workers.map(w=>({title:w.role,state:w.state,subtitle:w.model+' / '+w.task})));
  rows(inspector,'Evidence',m.detail.evidence.map(e=>({title:'Independent check',state:e.state,subtitle:e.record??'Record unavailable'})));
  rows(inspector,'Corrections',m.detail.corrections.map(c=>({title:c.text,state:'OBSERVED'})));
  rows(inspector,'Failures and recovery',[...m.detail.failures,...m.detail.pending].map(e=>({title:e.tool,state:e.state})));
  if(m.detail.recovery)inspector.append(text('p',m.detail.recovery,'muted'));
  const delta=el('delta');delta.replaceChildren(text('h3',m.humanDelta.required?'Human action required':'No human decision recorded'));
  if(m.humanDelta.required){delta.append(text('p',m.humanDelta.reason!));for(const action of m.humanDelta.actions)delta.append(text('p',action.label),text('p',action.instruction,'muted'));
    const contract=m.humanDelta.contract;if(contract){delta.append(text('h3','Current constraints'));for(const c of contract.corrections)delta.append(text('p',c));const d=document.createElement('details');d.append(text('summary','Acceptance contract'),text('code',JSON.stringify({objective:contract.id,revision:contract.revision,check:contract.digest},null,2)));delta.append(d);}
    delta.append(text('p','Confirmation goes through Cuesheet and your host. This view cannot grant execution authority.','muted'));
  }
  switchView(view);
}
function switchView(next:string){view=next;for(const id of ['card','inspector','delta'])el(id).hidden=id!==next;for(const [id,matching] of [['cardButton','card'],['inspectButton','inspector'],['deltaButton','delta']])el(id).setAttribute('aria-current',String(next===matching));}
function receive(result:unknown){const r=result as {_meta?:{mission?:Mission};isError?:boolean};if(r.isError){el('connection').textContent='Refresh failed. Last observed state retained.';return;}
  if(r._meta?.mission){mission=r._meta.mission;render();el('connection').textContent='Connected to Cuesheet. State comes from its journal.';}
}
async function refresh(){if(!mission||refreshing||!alive)return;refreshing=true;try{receive(await app.callServerTool({name:'get_mission',arguments:{missionId:mission.id}}));}catch{el('connection').textContent='Disconnected. Last observed state retained; refresh to reconnect.';}finally{refreshing=false;}}
app.ontoolresult=receive;
app.onhostcontextchanged=context=>{if(context.theme)document.documentElement.dataset.theme=context.theme;};
el('cardButton').onclick=()=>switchView('card');
el('inspectButton').onclick=async()=>{switchView('inspector');try{if(app.getHostContext()?.availableDisplayModes?.includes('fullscreen'))await app.requestDisplayMode({mode:'fullscreen'});}catch{/* Inline inspection remains available. */}};
el('deltaButton').onclick=()=>switchView('delta');el('refreshButton').onclick=()=>void refresh();
const timer=setInterval(()=>{if(!document.hidden)void refresh();},3000);
window.addEventListener('pagehide',()=>{alive=false;clearInterval(timer);});
app.onteardown=async()=>{alive=false;clearInterval(timer);return {};};
app.connect().then(()=>{const context=app.getHostContext();if(context?.theme)document.documentElement.dataset.theme=context.theme;el('connection').textContent='Connected to host. Waiting for a mission result.';}).catch(()=>{el('connection').textContent='Host connection unavailable. Use the textual MCP result.';});

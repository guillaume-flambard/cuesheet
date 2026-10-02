/** Rebuild the presentation journal, keeping it separate from harness evidence. */
import { projectEffectAttempts, mutationTool } from "../../../../src/adapters/tool-receipts.ts";
import { projectExecutions } from '../../../../src/adapters/execution-state.ts';
import { createStore, type Store } from '../app/store.ts';
import { derive, emptySurface, type Control, type Entry, type EntryBody, type SurfaceState } from '../app/state.ts';
import type { TerminalSession } from '../../../../src/adapters/terminal-session.ts';
const controls=new Set(['submit','compose','open','close','choose','quit','began','ended','interrupted','observed','settled','noted','logged','scoped','offered']);
const certainty=new Set(['confirmed','active','unknown','failed']);
function body(value:unknown):value is Omit<Entry,'id'> {
  if(!value || typeof value!=='object') return false;
  const e=value as Record<string,unknown>;
  if(e.kind==='you' || e.kind==='cuesheet' || e.kind==='failure') return typeof e.text==='string';
  if(e.kind==='action') return typeof e.label==='string' && (e.detail===undefined || typeof e.detail==='string') && certainty.has(String(e.certainty));
  if(e.kind==='status') return typeof e.label==='string' && typeof e.value==='string' && certainty.has(String(e.certainty));
  return false;
}
function entry(value:unknown):value is Entry {
  return body(value) && typeof (value as Record<string,unknown>).id==='string';
}
function control(value:unknown):value is Control {
  if(!value || typeof value!=='object') return false;
  const c=value as Record<string,unknown>;
  if(!controls.has(String(c.type))) return false;
  if(c.type==='submit' || c.type==='compose') return typeof c.text==='string';
  if(c.type==='logged') return typeof c.line==='string';
  if(c.type==='scoped') return typeof c.project==='string' && typeof c.where==='string';
  // An `observed` line must arrive with the name the producer gave it. Without
  // one the surface would hold several nameless lines, find them all alike, and
  // keep one: a restored conversation would silently lose every reply but the
  // first. A journal that cannot be trusted to name its lines is refused rather
  // than read into a view that would then lie about how much was said.
  if(c.type==='observed') return Array.isArray(c.entries) && c.entries.every(entry);
  if(c.type==='noted') return body(c.entry);
  if(c.type==='settled') return Number.isSafeInteger(c.at) && body(c.entry);
  if(c.type==='open') return ['none','palette','projects','inspect','help','models','sessions'].includes(String(c.overlay));
  const option=(v:unknown)=>!!v && typeof v==='object' && ['name','path','why'].every(key=>typeof (v as Record<string,unknown>)[key]==='string');
  if(c.type==='offered') return Array.isArray(c.choices) && c.choices.every(option);
  if(c.type==='choose') return option(c.option);
  return true;
}

/**
 * Rebuild the timeline from the journal, then say what the core log says that the
 * conversation does not.
 *
 * The replay is the whole of the restored conversation, and every line in it
 * arrives carrying the name the producer gave it, so a journal that recorded the
 * same line twice is read as one line rather than as two. The four lines added
 * afterwards are conclusions drawn here rather than recorded there, and they are
 * named by the surface for the same reason: their name has to be the same on
 * every restart, and a count carried forward through the replay is the one
 * source that is.
 */
export function restoreView(journal:TerminalSession):SurfaceState {
  let state=emptySurface;
  for(const event of journal.viewEvents) {
    if(event.kind!=='note' || event.subject!=='terminal.view' || !control(event.data.control)) throw new Error('Journal de conversation invalide ; reprise refusée.');
    state=derive(state,event.data.control);
  }
  const interrupted=state.busy || state.entries.some(e=>(e.kind==='action' || e.kind==='status') && e.certainty==='active');
  state=derive(state,{type:'interrupted'});
  state={...state,overlay:'none',choices:[]};
  const core=journal.core.toSession();
  state={...state,log:core.events.slice(-200).map(event=>`[${event.kind}] ${event.subject} ${JSON.stringify(event.data)}`)};
  if(core.goal && !core.goal.open) state=derive(state,{type:'noted',entry:{kind:'status',label:'résultat sauvegardé',value:`But vérifié sur la capture enregistrée · ${core.evidence.at(-1)?.backing ?? 'preuve dans le journal'}`,certainty:'confirmed'}});
  const uncertain=projectEffectAttempts(core.events).filter(a=>a.phase==="uncertain"&&mutationTool(a.tool));
  if(uncertain.length)state=derive(state,{type:'noted',entry:{kind:'status',label:'effets à inspecter',value:`${uncertain.length} effet(s) sans résultat durable. Le harness inspectera le projet avant de proposer une nouvelle mutation.`,certainty:'unknown'}});
  const execution=projectExecutions(core.events,{replaying:true}).at(-1);
  if(execution){
    const reasons:Record<string,string>={interrupted:"Exécution interrompue sans résultat final enregistré",cancelled:"Exécution arrêtée par la personne",failed:"Exécution arrêtée sur une erreur technique",limit:"Limite d’exécution atteinte",stagnation:"Exécution arrêtée sans nouvelle observation",blocked:"Exécution en attente de capacité"};
    const reason=reasons[execution.phase];
    if(reason) state=derive(state,{type:'noted',entry:{kind:'status',label:'exécution sauvegardée',value:`${reason} · ${execution.steps} inférences terminées · tranche ${execution.slice}/${execution.maxSlices}. Le but reste à poursuivre ; aucune action n’a été relancée.`,certainty:'unknown'}});
  }
  if(interrupted) state=derive(state,{type:'noted',entry:{kind:'status',label:'reprise',value:'Le processus précédent s’est arrêté. Les effets en cours restent inconnus ; aucune action n’a été relancée.',certainty:'unknown'}});
  return state;
}
export function persistentView(journal:TerminalSession):Store {
  const base=createStore(restoreView(journal));
  // A failure the journal reports is a conclusion drawn here, not a recorded
  // line, so it is named the same way the four lines above are. The surface
  // counts, which means a journal that reports the same unrepaired damage twice
  // says it twice rather than hiding the second report.
  journal.onFailure(message=>{
    base.send({type:'interrupted'});
    base.send({type:'noted',entry:{kind:'failure',text:message}});
  });
  return {
    get:base.get,subscribe:base.subscribe,
    send(c) {
      if(journal.failure && !["open","close","quit"].includes(c.type)) return;
      // Navigation is ephemeral. Work, messages and the draft are durable.
      if(!['open','close','quit'].includes(c.type)) {
        try {journal.appendView(c);} catch {return;}
      }
      base.send(c);
    },
  };
}

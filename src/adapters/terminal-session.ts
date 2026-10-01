/** Terminal durability at the adapter boundary; core remains in-memory and pure. */
import { EventStore, type Event } from '../core/store.ts';
import { SessionStore } from './session-store.ts';
import { mkdirSync, openSync, closeSync, readdirSync, unlinkSync, readFileSync, writeFileSync, renameSync, realpathSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ModelPreferences } from './model-preferences.ts';
import { projectEffectAttempts, RECEIPT_SUBJECT } from './tool-receipts.ts';
import { projectExecutions, EXECUTION_SUBJECT } from './execution-state.ts';
import { projectMemory, MEMORY_SUBJECT } from './work-memory.ts';
import { projectWorkPlans } from './work-plans.ts';
import { projectObjectives, OBJECTIVE_SUBJECT } from './objectives.ts';

export interface TerminalMetadata {
  version: 1;
  id: string;
  cwd: string;
  createdAt: number;
  check?: { script: string; digest: string };
}
export function terminalSessionRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.CUESHEET_SESSIONS || join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'cuesheet', 'terminal', 'sessions');
}
const validId = (id: string) => /^t-[A-Za-z0-9_-]+$/.test(id);
const eventKinds = new Set(['goal','capability','directive','observation','action','evidence','model','note','effect_requested','effect_observed','work_produced','work_verified']);
function validateEvents(events: Event[]): void {
  for (const [index,event] of events.entries()) {
    if (!event || event.seq !== index+1 || !Number.isFinite(event.at) || !eventKinds.has(event.kind) || typeof event.subject !== 'string' || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw new Error('Journal de session invalide ; aucun événement ne sera ajouté.');
  }
}

export class TerminalSession {
  readonly metadata: TerminalMetadata;
  readonly core: EventStore;
  readonly root: string;
  private durable: SessionStore;
  private claim: string;
  private closed = false;
  private problem: string | null = null;
  private releaseOnExit = () => this.close();
  private failures = new Set<(message: string) => void>();
  readonly viewEvents: Event[];

  constructor(options: { root: string; cwd: string; id?: string; check?: TerminalMetadata['check']; now?: () => number }) {
    this.root = options.root;
    mkdirSync(this.root, { recursive:true, mode:0o700 });
    const id = options.id ?? `t-${randomUUID()}`;
    if (!validId(id)) throw new Error('Identifiant de session terminal invalide.');
    this.claim = acquire(this.root, id);
    try {
      const manifest = join(this.root,`${id}.meta.json`);
      if (options.id) {
        this.metadata = readMetadata(manifest, id);
        if (!existsSync(join(this.root,`${id}.jsonl`)) || !existsSync(join(this.root,`${id}.view.jsonl`))) throw new Error('Journal de session manquant ; reprise refusée.');
        if (options.check && (options.check.digest !== this.metadata.check?.digest)) throw new Error('Le critère demandé diffère du critère de cette session. Crée une nouvelle session.');
      } else {
        this.metadata = { version:1, id, cwd:realpathSync(options.cwd), createdAt:Date.now(), ...(options.check ? {check:options.check} : {}) };
        writeMetadata(manifest,this.metadata);
      }
      // Detect a removed working directory before claiming anything about its work.
      if (realpathSync(this.metadata.cwd) !== this.metadata.cwd) throw new Error('Le répertoire de la session a changé.');
      this.durable = new SessionStore({root:this.root});
      if (!options.id) { this.durable.create(id,[]); this.durable.create(`${id}.view`,[]); chmodSync(join(this.root,`${id}.jsonl`),0o600); chmodSync(join(this.root,`${id}.view.jsonl`),0o600); }
      const events = this.durable.read(id); validateEvents(events); projectObjectives(events); projectWorkPlans(events); projectMemory(events); projectExecutions(events); projectEffectAttempts(events);
      this.viewEvents = this.durable.read(`${id}.view`); validateEvents(this.viewEvents);
      this.core = new WriteThroughStore(this,events,options.now ?? Date.now);
      process.once("exit",this.releaseOnExit);
    } catch (error) { unlinkSync(this.claim); throw error; }
  }
  get failure(): string | null { return this.problem; }
  onFailure(listener: (message:string)=>void): () => void { this.failures.add(listener); return () => {this.failures.delete(listener);}; }
  assertWritable(): void {
    if (this.problem) throw new Error(this.problem);
    if (this.closed) throw new Error('Cette session est fermée.');
    if (!existsSync(this.claim)) this.fail('La session a perdu son verrou. Le travail est arrêté.');
  }
  appendCore(expected: number,event: Omit<Event,'seq'>): Event {
    this.assertWritable();
    if(event.subject===MEMORY_SUBJECT) projectMemory([...this.core.toSession().events,{...event,seq:expected<0 ? 1 : expected+1}]);
    if(event.subject==="terminal.work") projectWorkPlans([...this.core.toSession().events,{...event,seq:expected<0 ? 1 : expected+1}]);
    if(event.subject===OBJECTIVE_SUBJECT) projectObjectives([...this.core.toSession().events,{...event,seq:expected<0 ? 1 : expected+1}]);
    if(event.subject===EXECUTION_SUBJECT) projectExecutions([...this.core.toSession().events,{...event,seq:expected<0 ? 1 : expected+1}]);
    if(event.subject===RECEIPT_SUBJECT || event.subject==="terminal.intent") projectEffectAttempts([...this.core.toSession().events,{...event,seq:expected<0 ? 1 : expected+1}]);
    try {
      if (this.durable.revision(this.metadata.id) !== expected) throw new Error('Le journal a été modifié par un autre écrivain.');
      const stored=this.durable.append(this.metadata.id,event);
      if(stored.seq!==(expected<0 ? 1 : expected+1)) throw new Error('Le journal a changé pendant l’écriture.');
      return stored;
    } catch { return this.fail('Écriture de session refusée. Le travail est arrêté ; aucun nouvel effet ne sera lancé.'); }
  }
  appendView(control: unknown): void {
    this.assertWritable();
    try { this.durable.appendFact(`${this.metadata.id}.view`,{kind:'note',subject:'terminal.view',data:{control}}); }
    catch { this.fail('Écriture de la conversation refusée. Le travail est arrêté ; les derniers changements affichés ne sont pas sauvegardés.'); }
  }
  recordModel(selection: ModelPreferences): void {
    this.core.append({kind:'note',subject:'terminal.model',data:{selection}});
  }
  get lastModel(): ModelPreferences | undefined {
    return this.core.toSession().events.filter(e=>e.kind==='note' && e.subject==='terminal.model').at(-1)?.data.selection as ModelPreferences | undefined;
  }
  close(): void { if (this.closed) return; this.closed=true; process.off("exit",this.releaseOnExit); try {unlinkSync(this.claim);} catch {} }
  private fail(message:string): never {
    this.problem=message;
    for(const listener of this.failures) listener(message);
    throw new Error(message);
  }
}

class WriteThroughStore extends EventStore {
  private journal: TerminalSession;
  private clock: () => number;
  constructor(journal:TerminalSession,events:Event[],clock:()=>number) {
    super(journal.metadata.id,clock);this.journal=journal;this.clock=clock;
    for(const event of events) super.append(event);
  }
  override append(event:Parameters<EventStore['append']>[0]):Event {
    const stored=this.journal.appendCore(this.revision,{...event,at:event.at ?? this.clock()});
    return super.append(stored);
  }
}

/** Unique claim filenames avoid removing a newly acquired claim during dead-writer cleanup. */
function acquire(root:string,id:string):string {
  const prefix=`${id}.writer-`;
  const claim=join(root,`${prefix}${process.pid}-${randomUUID()}.lock`);
  const fd=openSync(claim,'wx',0o600);closeSync(fd);
  try {
    for(const file of readdirSync(root)) {
      if (!file.startsWith(prefix) || !file.endsWith('.lock') || join(root,file)===claim) continue;
      const pid=Number(file.slice(prefix.length).split('-')[0]);
      if (!Number.isSafeInteger(pid) || pid<1) throw new Error('Verrou de session inconnu ; ouverture refusée.');
      let live=true;
      try {process.kill(pid,0);} catch(error) {live=(error as NodeJS.ErrnoException).code!=='ESRCH';}
      if(live) throw new Error('Cette session est déjà ouverte dans un autre terminal.');
      try {unlinkSync(join(root,file));} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
    }
    return claim;
  } catch(error) {unlinkSync(claim);throw error;}
}
function readMetadata(path:string,id:string):TerminalMetadata {
  try {
    const value=JSON.parse(readFileSync(path,'utf8')) as TerminalMetadata;
    if(value.version!==1 || value.id!==id || typeof value.cwd!=='string' || !value.cwd.startsWith('/') || !Number.isFinite(value.createdAt)) throw new Error();
    if(value.check && (typeof value.check.script!=='string' || !value.check.script.startsWith('/') || !/^[a-f0-9]{64}$/.test(value.check.digest))) throw new Error();
    return value;
  } catch {throw new Error(`Session ${id} absente ou métadonnées invalides ; ouverture refusée.`);}
}
function writeMetadata(path:string,value:TerminalMetadata):void {
  const temporary=`${path}.${randomUUID()}.pending`;
  writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});renameSync(temporary,path);
}
export function listTerminalSessions(root=terminalSessionRoot()):Array<{id:string;cwd:string;goal:string;lastAt:number;damaged:boolean}> {
  if(!existsSync(root)) return [];
  const durable=new SessionStore({root});
  return readdirSync(root).filter(file=>file.endsWith('.meta.json')).flatMap(file=>{
    const id=file.slice(0,-'.meta.json'.length);
    if(!validId(id)) return [];
    try {
      const metadata=readMetadata(join(root,file),id);
      const core=durable.attest(id);const view=durable.attest(`${id}.view`);
      let invalid=false;
      try {validateEvents(core.events);projectObjectives(core.events);projectWorkPlans(core.events);projectMemory(core.events);projectExecutions(core.events);projectEffectAttempts(core.events);validateEvents(view.events);} catch {invalid=true;}
      const goal=core.events.filter(e=>e.kind==='goal').at(-1);
      return [{id,cwd:metadata.cwd,goal:typeof goal?.data?.text==='string'?goal.data.text:'Nouvelle conversation',lastAt:Math.max(metadata.createdAt,core.events.at(-1)?.at ?? 0,view.events.at(-1)?.at ?? 0),damaged:invalid || !!core.damage || !!view.damage || !existsSync(join(root,`${id}.jsonl`)) || !existsSync(join(root,`${id}.view.jsonl`))}];
    } catch {return [{id,cwd:'Métadonnées invalides',goal:'Session endommagée',lastAt:0,damaged:true}];}
  }).sort((a,b)=>b.lastAt-a.lastAt);
}

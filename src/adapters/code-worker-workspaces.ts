import {randomUUID} from 'node:crypto';
import {join, resolve} from 'node:path';
import type {ModelAdapter} from '../core/loop.ts';
import type {NewEvent} from '../core/store.ts';
import {parseCodeWorkerPackets, type CodeWorkerPacket} from './code-worker-packets.ts';
import {captureGitSnapshot, snapshotMatches} from './git-snapshot.ts';
import {allocateWorktree} from './managed-worktrees.ts';

export interface PreparedCodeWorker {
  readonly id: string;
  readonly path: string;
  readonly packet: CodeWorkerPacket;
  readonly model: string;
  readonly adapter: ModelAdapter;
}
export type CodeWorkerPreparation =
  | {kind: 'ready'; workers: readonly PreparedCodeWorker[]; sourceDigest: string; base: string}
  | {kind: 'refused' | 'uncertain' | 'stale'; preserved: readonly string[]};

/** No inference or tool effects. Owner callbacks supply routes and append receipts. */
export async function prepareCodeWorkers(options: {
  input: unknown; source: string; root: string; execution: string;
  objective: {id: string; revision: number}; signal: AbortSignal;
  current(): boolean; route(role: string): {adapter: ModelAdapter; label: string};
  append(event: NewEvent): unknown;
}): Promise<CodeWorkerPreparation> {
  const preserved: string[] = [];
  const batch = randomUUID();
  let allocationStarted = false;
  const data = {version: 1, batch, execution: options.execution,
    objective: options.objective.id, revision: options.objective.revision};
  const record = (phase: string, extra: Record<string, unknown> = {}) =>
    options.append({kind: 'note', subject: 'terminal.code-workers', data: {...data, phase, ...extra}});
  const current = () => !options.signal.aborted && options.current();
  const fail = (kind: 'refused' | 'uncertain' | 'stale'): CodeWorkerPreparation => {
    record(kind, {preserved: [...preserved]});
    return {kind, preserved: Object.freeze([...preserved])};
  };
  try {
    if (!options.execution || !options.objective.id || !Number.isSafeInteger(options.objective.revision) ||
        options.objective.revision < 1 || !current()) return fail('stale');
    const packets = parseCodeWorkerPackets(options.input);
    // Resolve the entire configured batch before any repository operation.
    const routes = packets.map(packet => {
      const route = options.route(packet.role);
      if (!route || !route.adapter || typeof route.adapter.infer !== 'function' ||
          typeof route.label !== 'string' || !route.label.trim()) throw Error('Unavailable owner route.');
      return route;
    });
    if (!current()) return fail('stale');
    const snapshot = await captureGitSnapshot(options.source, options.signal);
    if (!current()) return fail('stale');
    const workers: PreparedCodeWorker[] = [];
    for (let index = 0; index < packets.length; index++) {
      if (!current()) return fail('stale');
      const packet = packets[index]!, route = routes[index]!, id = `w-${randomUUID()}`;
      const path = join(resolve(options.root), id);
      record('preparing', {id, path, role: packet.role, task: packet.task,
        files: [...packet.files], skills: [...packet.skills], model: route.label,
        source: snapshot.workspace, sourceDigest: snapshot.digest, base: snapshot.base});
      // Conservatively preserve any requested allocation even if its result is uncertain.
      preserved.push(path); allocationStarted = true;
      const result = await allocateWorktree({repository: snapshot.workspace, root: options.root,
        allocation: {id, unit: `code-${packet.role}`, agent: packet.role,
          objective: options.objective.id, revision: options.objective.revision, base: snapshot.base},
        snapshot, signal: options.signal});
      if (result.kind !== 'ready') return fail(result.kind === 'uncertain' || result.kind === 'busy' ? 'uncertain' : 'refused');
      record('prepared', {id, path: result.path});
      workers.push(Object.freeze({id, path: result.path, packet, model: route.label, adapter: route.adapter}));
    }
    if (!current() || !await snapshotMatches(snapshot, snapshot.workspace, options.signal) || !current()) return fail('stale');
    record('ready', {ids: workers.map(worker => worker.id), sourceDigest: snapshot.digest, base: snapshot.base});
    return {kind: 'ready', workers: Object.freeze(workers), sourceDigest: snapshot.digest, base: snapshot.base};
  } catch {
    return fail(!current() ? 'stale' : allocationStarted ? 'uncertain' : 'refused');
  }
}

/** Model proposals describe responsibilities. They never select executors or paths. */
export interface CodeWorkerPacket {
  readonly role: string;
  readonly task: string;
  readonly files: readonly string[];
  readonly skills: readonly string[];
}
const rolePattern = /^[a-z][a-z0-9-]{0,47}$/;
const skillPattern = /^[a-z][a-z0-9-]{0,63}$/;
const forbiddenSegments = new Set(['.git', '.cuesheet', 'node_modules', '.npm', '.npmrc', '.pypirc']);
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function filePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 240 ||
      value !== value.trim() || /[\\:*?\[\]{}\x00-\x1f\x7f]/.test(value)) return false;
  const parts = value.split('/');
  return parts.every(part => part && part === part.trim() && !part.endsWith('.') &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) &&
    part !== '.' && part !== '..' &&
    !forbiddenSegments.has(part.toLowerCase()) && !/^\.env(?:\.|$)/i.test(part));
}
function overlaps(a: string, b: string): boolean {
  // Portable plans must not depend on filesystem case sensitivity.
  a = a.normalize('NFC').toLowerCase(); b = b.normalize('NFC').toLowerCase();
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}
/** Validate the whole batch before routes, allocation, inference or effects. */
export function parseCodeWorkerPackets(input: unknown): readonly CodeWorkerPacket[] {
  const invalid = (): never => { throw new Error('Invalid code-worker batch: expected 1–2 distinct roles with bounded tasks and disjoint safe relative files.'); };
  if (!record(input) || Object.keys(input).some(key => key !== 'tasks') ||
      !Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 2) return invalid();
  const roles = new Set<string>();
  const allFiles: string[] = [];
  const packets: CodeWorkerPacket[] = [];
  for (const proposal of input.tasks) {
    if (!record(proposal) || Object.keys(proposal).some(key => !['role', 'task', 'files', 'skills'].includes(key)) ||
        typeof proposal.role !== 'string' || !rolePattern.test(proposal.role) || roles.has(proposal.role) ||
        typeof proposal.task !== 'string' || !proposal.task.trim() || proposal.task.length > 4000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(proposal.task) ||
        !Array.isArray(proposal.files) || proposal.files.length < 1 || proposal.files.length > 32 ||
        !proposal.files.every(filePath) ||
        (proposal.skills !== undefined && (!Array.isArray(proposal.skills) || proposal.skills.length > 3 ||
          !proposal.skills.every(skill => typeof skill === 'string' && skillPattern.test(skill))))) return invalid();
    const files = proposal.files as string[];
    // Reject redundant/overlapping responsibilities within a packet too.
    for (const file of files) {
      if (allFiles.some(prior => overlaps(prior, file))) return invalid();
      allFiles.push(file);
    }
    const skills = proposal.skills === undefined ? [] : proposal.skills as string[];
    if (new Set(skills).size !== skills.length) return invalid();
    roles.add(proposal.role);
    packets.push(Object.freeze({role: proposal.role, task: proposal.task.trim(),
      files: Object.freeze([...files]), skills: Object.freeze([...skills])}));
  }
  return Object.freeze(packets);
}

/**
 * Explicit owner opt-in for external skill libraries.
 *
 * External skill roots belong to the project named by the owner, not to every
 * project which happens to run in the same Cuesheet process. They are read-only
 * instructions and never enlarge the action/tool scope.
 */
import {delimiter, isAbsolute, join, resolve} from "node:path";

export interface SkillScopeSettings {
  CUESHEET_SKILL_ROOTS?: string;
  CUESHEET_SKILL_PROJECT?: string;
}

export function skillRootsForScope(
  scope: string,
  settings: SkillScopeSettings = process.env,
): string[] {
  const defaultRoot = join(resolve(scope), ".cuesheet", "skills");
  const explicit = (settings.CUESHEET_SKILL_ROOTS ?? "")
    .split(delimiter)
    .filter(Boolean);
  if (!explicit.length) return [defaultRoot];

  const project = settings.CUESHEET_SKILL_PROJECT;
  if (!project || !isAbsolute(project) || /[\0\r\n]/.test(project)) {
    throw new Error(
      "External skill roots require CUESHEET_SKILL_PROJECT set to an absolute project path.",
    );
  }
  if (explicit.some(root => !isAbsolute(root) || /[\0\r\n]/.test(root))) {
    throw new Error("Every CUESHEET_SKILL_ROOTS entry must be an absolute directory path.");
  }

  // Nonmatching projects retain their own local skill registry, never the
  // external one. Do not treat prefix paths or adjacent worktrees as a match.
  if (resolve(scope) !== resolve(project)) return [defaultRoot];
  return [...new Set(explicit.map(root => resolve(root)))];
}

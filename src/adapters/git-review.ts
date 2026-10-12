/** Read-only, scope-bound working-tree review. This is NOT an acceptance oracle. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { inspectAgentGit } from "./agent-git.ts";

export type GitReview =
  | { readonly kind: "observed"; readonly workspace: string; readonly head: string;
      readonly digest: string; readonly lines: readonly string[]; readonly truncated: boolean }
  | { readonly kind: "unavailable"; readonly reason: string };

const LIMIT = 128 * 1024;
const MAX_LINES = 800;
const safeLine = (text: string): string => text
  .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g, "")
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "�");

async function git(cwd: string, args: string[]): Promise<string> {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  };
  return new Promise((accept, reject) => execFile("git",
    ["--no-pager", "-c", "core.fsmonitor=false", ...args],
    { cwd, env, encoding: "utf8", maxBuffer: LIMIT, timeout: 5000 },
    (error, out) => error ? reject(error) : accept(out),
  ));
}

/** Returns only a bounded, actual Git observation from exactly the active root. */
export async function readGitReview(scope: string): Promise<GitReview> {
  const inventory = await inspectAgentGit(scope);
  if (inventory.kind !== "repository" || inventory.repository !== inventory.workspace || !inventory.head) {
    return { kind: "unavailable", reason: "Revue Git indisponible : le périmètre actif doit être la racine d'un dépôt commité et autorisé." };
  }
  try {
    const [staged, working, untracked, head] = await Promise.all([
      git(inventory.workspace, ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--no-color", "HEAD", "--"]),
      git(inventory.workspace, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--"]),
      git(inventory.workspace, ["ls-files", "--others", "--exclude-standard", "-z"]),
      git(inventory.workspace, ["rev-parse", "--verify", "HEAD"]),
    ]);
    if (head.trim() !== inventory.head) return {kind:"unavailable", reason:"Le commit a changé pendant la lecture : relancer la revue."};
    const paths = untracked.split("\0").filter(Boolean);
    const formatted = [
      "Lecture Git du workspace actif · modifications observées, non vérifiées.",
      "Ce diff n'est ni un test réussi, ni une preuve d'acceptation.",
      "Source : " + inventory.workspace,
      "HEAD : " + inventory.head.slice(0, 12),
      "",
      "Index · staged",
      ...(staged ? staged.trimEnd().split("\n") : ["(aucune modification indexée)"]),
      "",
      "Worktree · unstaged",
      ...(working ? working.trimEnd().split("\n") : ["(aucune modification non indexée)"]),
      "",
      "Nouveaux fichiers · noms seulement, contenu non lu",
      ...(paths.length ? paths.map(path => "? " + path) : ["(aucun fichier non suivi)"]),
    ];
    const lines = formatted.slice(0, MAX_LINES).map(safeLine);
    const truncated = formatted.length > MAX_LINES;
    if (truncated) lines.push("… aperçu tronqué ; ouvrir Git pour lire la suite. Rien n'est validé.");
    return {
      kind: "observed", workspace: inventory.workspace, head: inventory.head, lines, truncated,
      digest: createHash("sha256").update(JSON.stringify([inventory.head, staged, working, paths])).digest("hex"),
    };
  } catch {
    return { kind: "unavailable", reason: "Revue Git indisponible ou trop volumineuse : inspecter le dépôt directement." };
  }
}

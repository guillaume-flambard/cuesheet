/**
 * Adapter: the filesystem as a source of capability facts.
 *
 * Same split as the OpenCode adapter: this is the only place allowed to know
 * that skills live in directories and declare themselves with markdown
 * frontmatter. The core receives Capability[] and never asks where it came
 * from. Scanning is synchronous and cheap enough to rerun at every delegation,
 * which is the point: a delegate resolves against the live layer, not against
 * a list captured when this process started.
 *
 * Naming a skill by its frontmatter, not its folder name, is deliberate: a
 * folder renamed on disk must not change what a delegator means by the name.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { Capability } from "../core/capability.ts";

export interface SkillProvider {
  /** Every skill currently on disk, as this adapter sees it. */
  listCapabilities(): Capability[];
}

export interface SkillsAdapterOptions {
  /** Directories to scan, each expected to hold one folder per skill. */
  roots: string[];
}

/** Folders whose names start with these are never treated as skills. */
const IGNORED = new Set(["node_modules", ".git", "test", "tests"]);

export class SkillsAdapter implements SkillProvider {
  private readonly roots: string[];

  constructor(options: SkillsAdapterOptions) {
    this.roots = options.roots;
  }

  listCapabilities(): Capability[] {
    const capabilities: Capability[] = [];

    for (const root of this.roots) {
      let folders: string[];
      try {
        folders = readdirSync(root, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !IGNORED.has(d.name))
          .map((d) => d.name);
      } catch {
        // Fail open, and say so: a root that cannot be read means "cannot
        // tell", identical to how the OpenCode adapter treats a missing
        // database. The core decides what to do with the absence of evidence;
        // this adapter refuses to invent evidence it does not have.
        continue;
      }

      for (const folder of folders) {
        const path = join(root, folder);
        const parsed = this.parseSkill(path, folder);
        if (parsed) {
          capabilities.push(parsed);
        }
      }
    }

    // Newest root wins going forward, so adapters must order deterministically:
    // roots in the order the caller gave them, skills alphabetically inside.
    return capabilities;
  }

  private parseSkill(path: string, folderName: string): Capability | null {
    let raw: string;
    try {
      raw = readFileSync(join(path, "SKILL.md"), "utf8");
    } catch {
      return null;
    }

    const match = /^name:\s*(\S+)/m.exec(raw);
    const name = match?.[1] ?? folderName;
    const version = createHash("sha256").update(raw).digest("hex").slice(0, 12);

    return { kind: "skill", name, version, source: path };
  }
}

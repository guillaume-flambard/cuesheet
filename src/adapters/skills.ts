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
import { chmodSync, readFileSync, readdirSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";

import {
  REGISTRY_UNVERIFIED,
  type Capability,
} from "../core/capability.ts";

export interface SkillProvider {
  /**
   * Every skill currently on disk, as this adapter sees it, plus what it could
   * not see. A caller that ignores the second half can still treat absence as
   * evidence, which is the one thing this adapter exists to prevent.
   */
  listCapabilities(): SkillListing;
}

/**
 * A skill registry as observed, and the limits of that observation.
 *
 * `unreadable` names the folders that look like skills but whose manifest
 * could not be read. They are absent from `capabilities` because nothing was
 * established about them, and they are not silently absent, because something
 * was seen and refused to be read.
 */
export interface SkillListing {
  capabilities: Capability[];
  /** Folders that look like a skill but whose SKILL.md could not be read. */
  unreadable: Array<{ folder: string; path: string; reason: string }>;
  /** True when a root could not be read at all. */
  anyRootUnreadable: boolean;
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

  listCapabilities(): SkillListing {
    const capabilities: Capability[] = [];
    const unreadable: SkillListing["unreadable"] = [];
    let anyRootUnreadable = false;

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
        anyRootUnreadable = true;
        continue;
      }

      for (const folder of folders) {
        const path = join(root, folder);
        const parsed = this.parseSkill(path, folder, root);
        if ("capability" in parsed) {
          capabilities.push(parsed.capability);
        } else {
          unreadable.push({ folder, path, reason: parsed.reason });
        }
      }
    }

    // A registry where nothing at all could be read is not an empty registry,
    // and it is not faked into one by inventing a capability with a name in
    // it. `REGISTRY_UNVERIFIED` is the core's own marker, and the flag below
    // is what the core reads to set it. Inventing a pseudo-capability here
    // would put "unreadable" into the list of real capabilities, which is the
    // same error one level up: a thing that was never observed, presented as a
    // thing that was.
    return { capabilities, unreadable, anyRootUnreadable };
  }

  /**
   * One folder's manifest. A read failure is a reported fact, not a null that
   * the caller cannot tell from "this folder is not a skill".
   */
  private parseSkill(
    path: string,
    folderName: string,
    root: string,
  ): { capability: Capability } | { reason: string } {
    let raw: string;
    try {
      const manifest=realpathSync(join(path,"SKILL.md"));
      if(!manifest.startsWith(realpathSync(root)+sep))throw new Error("Skill manifest resolves outside its configured root.");
      if(statSync(manifest).size>262144)throw new Error("Skill manifest exceeds 256 KiB.");
      raw = readFileSync(join(path, "SKILL.md"), "utf8");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return { reason: detail.split("\n")[0] ?? detail };
    }

    const match = /^name:\s*(\S+)/m.exec(raw);
    const name = match?.[1] ?? folderName;
    const version = createHash("sha256").update(raw).digest("hex").slice(0, 12);

    return { capability: { kind: "skill", name, version, source: path } };
  }
}

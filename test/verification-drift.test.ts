import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { digestDirectory } from "../src/adapters/artifact-capture.ts";
import { currentArtifactComparison } from "../src/adapters/verification-drift.ts";
import type {Event} from "../src/core/store.ts";

it("distinguishes unchanged captured bytes from changed bytes without claiming verified",async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-drift-"));
 const env={PATH:process.env.PATH??"/usr/bin:/bin",HOME:root,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null"};
 try {
  const git=(a:string[])=>execFileSync("git",a,{cwd:root,env});
  git(["init","-q"]);git(["config","user.name","Fixture"]);git(["config","user.email","fixture@example.com"]);
  writeFileSync(join(root,"code.ts"),"hello");git(["add","code.ts"]);git(["commit","-qm","base"]);
  const digest=digestDirectory(root).digest;
  const events=[{kind:"work_verified",data:{target:{artifactDigest:digest}}}] as Event[];
  assert.match((await currentArtifactComparison(root,events)).join(" "),/identique/);
  assert.doesNotMatch((await currentArtifactComparison(root,events)).join(" "),/VÉRIFIÉ ACTUELLEMENT/);
  writeFileSync(join(root,"code.ts"),"changed");
  assert.match((await currentArtifactComparison(root,events)).join(" "),/DIFFÉRENT/);
  mkdirSync(join(root,"secret"));writeFileSync(join(root,"secret","readme"),"value");
  assert.match((await currentArtifactComparison(join(root,"secret"),events)).join(" "),/refusée/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
it("fails closed with absent verification",async()=>{
 assert.match((await currentArtifactComparison("/missing",[])).join(" "),/aucun reçu/);
});

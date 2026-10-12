import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readGitReview } from "../src/adapters/git-review.ts";

it("shows staged and unstaged diffs with untracked paths, never a fabricated verification", async () => {
 const root=mkdtempSync(join(tmpdir(),"cuesheet-git-review-"));
 const env={PATH:process.env.PATH??"/usr/bin:/bin",HOME:root,LC_ALL:"C",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null"};
 const git=(args:string[])=>execFileSync("git",args,{cwd:root,env,encoding:"utf8"});
 try{
  git(["init","-q"]);git(["config","user.name","Fixture"]);git(["config","user.email","fixture@example.com"]);
  writeFileSync(join(root,"a.ts"),"export const a = 1;\n");
  writeFileSync(join(root,"b.ts"),"export const b = 1;\n");
  git(["add","a.ts","b.ts"]);git(["commit","-qm","base"]);
  writeFileSync(join(root,"a.ts"),"export const a = 2;\n");git(["add","a.ts"]);
  writeFileSync(join(root,"b.ts"),"export const b = 3;\n");
  writeFileSync(join(root,"new.ts"),"private untracked file content");
  const before=git(["status","--porcelain"]);
  const review=await readGitReview(root);
  assert.equal(review.kind,"observed");
  if(review.kind!=="observed")return;
  const text=review.lines.join("\n");
  assert.match(text,/Index · staged/);assert.match(text,/Worktree · unstaged/);
  assert.match(text,/\+export const a = 2/);assert.match(text,/\+export const b = 3/);
  assert.match(text,/new\.ts/);
  assert.doesNotMatch(text,/private untracked file content/);
  assert.match(text,/non vérifiées|sans validation/i);
  assert.ok(review.digest.length>=32);
  assert.equal(git(["status","--porcelain"]),before,"review cannot modify files or staging");
 }finally{rmSync(root,{recursive:true,force:true});}
});

it("refuses to review a repository outside the supplied scope or an ordinary folder",async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-git-review-scope-"));
 try {
  mkdirSync(join(root,"sub"));
  assert.equal((await readGitReview(root)).kind,"unavailable");
  const env={PATH:process.env.PATH??"/usr/bin:/bin",HOME:root,LC_ALL:"C",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null"};
  execFileSync("git",["init","-q"],{cwd:root,env});
  const nested=await readGitReview(join(root,"sub"));
  assert.equal(nested.kind,"unavailable","cannot silently widen from subfolder to entire repository");
 }finally{rmSync(root,{recursive:true,force:true});}
});

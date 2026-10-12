import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { trackedFileMentions } from "../src/adapters/file-mentions.ts";

it("lists only tracked non-sensitive filenames in the exact active repository", async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-file-mentions-"));
 const env={PATH:process.env.PATH??"/usr/bin:/bin",HOME:root,GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null"};
 try{
  mkdirSync(join(root,"src"));mkdirSync(join(root,"sub"));mkdirSync(join(root,".ssh"));
  writeFileSync(join(root,"src","one.ts"),"hello");
  writeFileSync(join(root,".env"),"secret");
  writeFileSync(join(root,".ssh","id_rsa"),"secret");
  writeFileSync(join(root,"untracked.ts"),"untracked");
  const git=(a:string[])=>execFileSync("git",a,{cwd:root,env});
  git(["init","-q"]);git(["config","user.name","Test"]);git(["config","user.email","test@example.com"]);
  git(["add","src/one.ts",".env",".ssh/id_rsa"]);git(["commit","-qm","base"]);
  assert.deepEqual(await trackedFileMentions(root),["src/one.ts"]);
  assert.deepEqual(await trackedFileMentions(join(root,"sub")),[]);
 }finally{rmSync(root,{recursive:true,force:true});}
});

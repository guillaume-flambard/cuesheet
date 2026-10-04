import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createScopedToolRunner} from "../apps/terminal/src/producer/runtime.ts";
const route={kind:"container" as const,image:"sha256:"+"a".repeat(64),socket:"/nonexistent/cuesheet-test.sock",defaultImage:false};
test("linked container worktree does not advertise or execute inaccessible Git",async()=>{
 const scope=mkdtempSync(join(tmpdir(),"cs-git-vocabulary-"));
 try {writeFileSync(join(scope,".git"),"gitdir: /unmounted/metadata\n");
 const tools=createScopedToolRunner({scope,route}) as ReturnType<typeof createScopedToolRunner>&{names:readonly string[];policy:string};
 assert.ok(!tools.names.includes("git"));assert.ok(tools.names.includes("node"));assert.match(tools.policy,/Git non disponible/);
 const result=await tools.run({name:"git",input:{argv:["git","status","--short"]}});assert.equal(result.exit,127);assert.doesNotMatch(result.output,/Container tool not confirmed/);
 const local=createScopedToolRunner({scope,route:{kind:"local",reason:"owner-selected local route"}}) as typeof tools;assert.ok(local.names.includes("git"));
 }finally{rmSync(scope,{recursive:true,force:true});}
});
test("container repository with mounted metadata keeps its Git vocabulary",()=>{
 const scope=mkdtempSync(join(tmpdir(),"cs-git-local-metadata-"));
 try {mkdirSync(join(scope,".git"));const tools=createScopedToolRunner({scope,route}) as ReturnType<typeof createScopedToolRunner>&{names:readonly string[]};assert.ok(tools.names.includes("git"));}
 finally{rmSync(scope,{recursive:true,force:true});}
});

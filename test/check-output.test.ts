import {it} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {capture} from "../src/adapters/artifact-capture.ts";
import {runAgainstArtifactAsync} from "../src/adapters/artifact-verifier.ts";

it("records bounded failing test output, redacts common token formats and keeps rejection",async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-check-output-"));
 try{
  const work=join(root,"work");mkdirSync(work);writeFileSync(join(work,"file.txt"),"fixture");
  const artifact=capture({sessionId:"S",effectId:"E1",workspace:work,root});
  const script='console.error("TEST FAILED: expected 2 got 3");console.log("token=PRIVATEKEY");console.log("sk-ABCDEFGHIJKLMNOPQRSTUVWX");console.log("x".repeat(8000));process.exit(1)';
  const result=await runAgainstArtifactAsync({artifact,command:process.execPath,args:["-e",script],verificationId:"V",timeoutMs:10000});
  assert.equal(result.verdict,"REJECTED");
  const text=result.evidence.find(e=>e.kind==="check_output")?.value??"";
  assert.match(text,/TEST FAILED/);
  assert.match(text,/\[REDACTED\]/);
  assert.doesNotMatch(text,/PRIVATEKEY|ABCDEFGHIJKLMNOPQRSTUVWX/);
  assert.ok(text.length<=4096);
 }finally{rmSync(root,{recursive:true,force:true});}
});

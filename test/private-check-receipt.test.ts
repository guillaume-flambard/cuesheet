import {it} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,statSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createCompletionCheck} from "../src/adapters/surface-verification.ts";
import {verificationReviewLines} from "../src/adapters/verification-review.ts";
import type {Event} from "../src/core/store.ts";

it("keeps test diagnostics in a private sidecar rather than persisted verification",async()=>{
 const root=mkdtempSync(join(tmpdir(),"cuesheet-private-receipt-"));
 try{
  const workspace=join(root,"workspace"),storage=join(root,"checks");
  mkdirSync(workspace);mkdirSync(storage);
  writeFileSync(join(workspace,"code.ts"),"hello");
  const script=join(root,"check.mjs");
  writeFileSync(script,'console.error("test failed: HIDDEN_DIAGNOSTIC");process.exit(1)');
  const check=createCompletionCheck({script,root:storage,timeoutMs:5000});
  const result=await check.verify(workspace,"E1");
  assert.equal(result.verification.verdict,"REJECTED");
  assert.ok(result.verification.evidence.every(e=>e.kind!=="check_output"));
  const persisted=readFileSync(result.record,"utf8");
  assert.doesNotMatch(persisted,/HIDDEN_DIAGNOSTIC/);
  const sidecar=result.record.replace(/\.json$/,".diagnostic.txt");
  assert.ok(existsSync(sidecar));
  assert.match(readFileSync(sidecar,"utf8"),/HIDDEN_DIAGNOSTIC/);
  if(process.platform!=="win32")assert.equal(statSync(sidecar).mode&0o777,0o600);
  assert.deepEqual(check.readDiagnostic?.(result.record),["test failed: HIDDEN_DIAGNOSTIC"]);
  assert.deepEqual(check.readDiagnostic?.(join(workspace,"outside.json")),[]);
  assert.deepEqual(check.readDiagnostic?.(result.record.replace(/\.json$/,".other.json")),[]);
  const history=[{seq:1,at:1,kind:"work_verified",subject:"E1",data:{...result.verification,record:result.record,checkDigest:result.checkDigest}}] as Event[];
  const view=verificationReviewLines(history,record=>check.readDiagnostic?.(record)??[]).join("\n");
  assert.match(view,/Sortie du check/);
  assert.match(view,/HIDDEN_DIAGNOSTIC/);
  assert.doesNotMatch(JSON.stringify(history),/HIDDEN_DIAGNOSTIC/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,statSync,readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCompletionCheck } from "../src/adapters/surface-verification.ts";

it("private check output longer than 4KiB survives restart and scrollable review",async()=>{
  const root=mkdtempSync(join(tmpdir(),"cuesheet-check-pages-"));
  try {
    const workspace=join(root,"workspace"),storage=join(root,"proof");
    mkdirSync(workspace);mkdirSync(storage);
    writeFileSync(join(workspace,"unit.ts"),"export {}");
    const script=join(root,"check.mjs");
    writeFileSync(script,'for(let i=0;i<210;i++)console.error("failure "+i+" "+ "detail".repeat(7));process.exit(1)');
    const first=createCompletionCheck({script,root:storage,timeoutMs:10000});
    const result=await first.verify(workspace,"E42");
    assert.equal(result.verification.verdict,"REJECTED");
    assert.ok(result.verification.evidence.every(e=>e.kind!=="check_output"));
    const sidecar=result.record.replace(/\.json$/,".diagnostic.txt");
    assert.ok(statSync(sidecar).size>4096);
    assert.ok(statSync(sidecar).size<=16384);
    assert.doesNotMatch(readFileSync(result.record,"utf8"),/failure 42/);
    const reopened=createCompletionCheck({script,root:storage,timeoutMs:10000});
    const lines=reopened.readDiagnostic?.(result.record)??[];
    assert.ok(lines.length>70);
    assert.match(lines.at(0)??"",/failure 0/);
    assert.match(lines[90]??"",/failure 90/);
    if(process.platform!=="win32")assert.equal(statSync(sidecar).mode&0o777,0o600);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

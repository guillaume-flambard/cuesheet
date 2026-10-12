import { it } from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../src/core/store.ts";
import { verificationReviewLines } from "../src/adapters/verification-review.ts";

it("never calls a model claim or an orphan verification a valid check",()=>{
 const store=new EventStore("proof",()=>1);
 store.append({kind:"goal",subject:"builder",data:{text:"Fix"}});
 store.append({kind:"work_verified",subject:"run-1",data:{verdict:"VERIFIED",target:{artifactDigest:"a".repeat(64)},objectiveId:"wrong",objectiveRevision:1}});
 const lines=verificationReviewLines(store.toSession().events).join("\n");
 assert.match(lines,/NON VALIDÉ/);
 assert.match(lines,/source introuvable/);
 assert.doesNotMatch(lines,/VÉRIFIÉ HISTORIQUEMENT/);
});
it("retains historical verdict only for matching produced digest and source",()=>{
 const store=new EventStore("proof2",()=>1);
 store.append({kind:"goal",subject:"builder",data:{text:"Fix"}});
 store.append({kind:"work_produced",subject:"run",data:{artifactDigest:"b".repeat(64),objectiveId:null,objectiveRevision:null}});
 store.append({kind:"work_verified",subject:"run",data:{verdict:"VERIFIED",target:{artifactDigest:"b".repeat(64)},objectiveId:null,objectiveRevision:null,checkDigest:"c".repeat(64),record:"/tmp/proof"}});
 const result=verificationReviewLines(store.toSession().events).join("\n");
 assert.match(result,/NON VALIDÉ/);
 assert.match(result,/digest du workspace courant/);
});

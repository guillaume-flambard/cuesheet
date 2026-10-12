import {it} from "node:test";
import assert from "node:assert/strict";
import {EventStore} from "../src/core/store.ts";
import {createObjective} from "../src/adapters/objectives.ts";
import {verificationReviewLines} from "../src/adapters/verification-review.ts";

function receiptView(checkDigest:string,effectId="E1"):string {
 const store=new EventStore("receipt-match",()=>1);
 const source=store.append({kind:"note",subject:"terminal.user",data:{text:"Fix the feature"}});
 const contractDigest="a".repeat(64), artifactDigest="c".repeat(64);
 const objective=createObjective(store,"Fix the feature","/fixture",source.seq,contractDigest);
 const contract={objectiveId:objective.id,objectiveRevision:objective.revision};
 store.append({kind:"work_produced",subject:"E1",data:{artifactDigest,...contract}});
 store.append({kind:"work_verified",subject:"E1",data:{verdict:"VERIFIED",target:{effectId,artifactDigest},checkDigest,record:"/private/receipt.json",...contract}});
 return verificationReviewLines(store.toSession().events).join("\n");
}
it("shows historical verification only for the exact pinned check digest",()=>{
 assert.match(receiptView("a".repeat(64)),/VÉRIFIÉ HISTORIQUEMENT/);
 assert.match(receiptView("b".repeat(64)),/NON VALIDÉ POUR LE CONTRAT ACTUEL/);
});
it("never credits a receipt targeting a different effect",()=>{
 assert.match(receiptView("a".repeat(64),"E2"),/NON VALIDÉ POUR LE CONTRAT ACTUEL/);
});

import { it } from "node:test";
import assert from "node:assert/strict";
import { filterSessionChoices } from "../apps/terminal/src/overlays/session-search.ts";

const sessions = [
 {id:"s1",cwd:"/work/cuesheet",goal:"Réparer le projet",lastAt:3,damaged:false},
 {id:"s2",cwd:"/work/kollio",goal:"Construire le document",lastAt:2,damaged:false},
 {id:"s3",cwd:"/work/kollio",goal:"Vérifier la reprise",lastAt:1,damaged:true},
];

it("filters sessions using objective, project and id while retaining recency order",()=>{
 assert.deepEqual(filterSessionChoices(sessions,"").map(s=>s.id),["s1","s2","s3"]);
 assert.deepEqual(filterSessionChoices(sessions,"kollio").map(s=>s.id),["s2","s3"]);
 assert.deepEqual(filterSessionChoices(sessions,"verifier REPRISE").map(s=>s.id),["s3"]);
 assert.deepEqual(filterSessionChoices(sessions,"S1").map(s=>s.id),["s1"]);
 assert.deepEqual(filterSessionChoices(sessions,"not there"),[]);
});

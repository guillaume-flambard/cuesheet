import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindProject, type ProjectIdentity} from '../src/adapters/project-binding.ts';
import {resolveScope} from '../apps/terminal/src/producer/context.ts';

const project = (name:string):ProjectIdentity => ({
 name, path:name, kind:'repo', status:'active', nature:'product', stack:'', exists:true,
});
const ids=[project('cuesheet'),project('drop'),project('billing-api')];

test('an uppercase hyphenated output marker cannot silently change project scope',()=>{
 const text='Réponds uniquement avec BONJOUR-CUESHEET-OK. Ne modifie aucun fichier.';
 assert.equal(bindProject(text,ids).kind,'no_match');
 const scope=resolveScope(text,'/tmp/cuesheet-scratch',ids,bindProject,'/Users/memo/projects');
 assert.equal(scope.path,'/tmp/cuesheet-scratch');
 assert.equal(scope.at,'unresolved');
});

test('a deliberately named project still binds, including a complete hyphenated name',()=>{
 for(const [text,want] of [
   ['Travaille sur cuesheet et résume les corrections','cuesheet'],
   ['Travaille sur billing-api','billing-api'],
   ['Améliore le projet Drop','drop'],
 ] as const){
   const result=bindProject(text,ids);
   assert.equal(result.kind,'bound',text);
   if(result.kind==='bound') assert.equal(result.candidate.name,want);
 }
});

test('unknown compound identifier is not an unrelated project reference',()=>{
 for(const input of ['PREFIX-BILLING-API-OK','HELLO-DROP-WORLD','BONJOUR-CUESHEET-OK']){
   const result=bindProject(input,ids);
   assert.equal(result.kind,'no_match',input);
 }
});

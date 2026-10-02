import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseStateGraph} from '../src/adapters/state-graph/schema.ts';
const source={path:'src/domain.ts',digest:'a'.repeat(64)};
const node=(id:string,kind='entity')=>({id,kind,domainId:'domain',revision:1,sourceRefs:[source],ownerRef:'owner.project',contractRefs:[],invariantRefs:[],checkRefs:[]});
const graph=()=>({version:1,nodes:[node('domain','domain'),node('a'),node('b')],edges:[] as any[]});
const parse=(g:unknown)=>parseStateGraph(JSON.stringify(g));
test('strict graph is immutable and cyclic dependencies remain representable for later SCC impact',()=>{
 const g=graph();g.edges.push({id:'ab',type:'depends_on',dependent:'a',dependency:'b',sourceRef:source},{id:'ba',type:'depends_on',dependent:'b',dependency:'a',sourceRef:source});
 const parsed=parse(g);assert.equal(parsed.edges.length,2);assert.ok(Object.isFrozen(parsed));assert.ok(Object.isFrozen(parsed.nodes[0]!.sourceRefs[0]));assert.ok(Object.isFrozen(parsed.edges));
});
test('unknown authority, versions, duplicate identities and invalid endpoints refuse',()=>{
 for(const mutate of [(g:any)=>g.version=2,(g:any)=>g.permissions=['execute'],(g:any)=>g.nodes.push(g.nodes[0]),(g:any)=>g.nodes[1].domainId='a',
  (g:any)=>g.nodes[1].revision=0,(g:any)=>g.nodes[1].kind=['entity'],(g:any)=>g.nodes[1].checkRefs=['a'],(g:any)=>g.nodes[1].contractRefs=['missing'],
  (g:any)=>g.edges.push({id:'bad',type:'depends_on',dependent:'a',dependency:'missing',sourceRef:source}),
  (g:any)=>g.edges.push({id:'bad',type:'execute',dependent:'a',dependency:'b',sourceRef:source}),
  (g:any)=>g.edges.push({id:'bad',type:['depends_on'],dependent:'a',dependency:'b',sourceRef:source}),
  (g:any)=>g.edges.push({id:'bad',type:'depends_on',dependent:'a',dependency:'a',sourceRef:source})]){const g=graph();mutate(g);assert.throws(()=>parse(g));}
});
test('unsafe sources, duplicate references and oversized manifests do not silently truncate',()=>{
 for(const path of ['/tmp/x','../x','a/../x','a\\b','a//b','.git/config','.env.local','C:/x','NUL.txt','a/ b']){const g=graph();g.nodes[0]!.sourceRefs=[{...source,path}];assert.throws(()=>parse(g));}
 const g=graph();g.nodes[1]!.contractRefs=['x','x'] as never;assert.throws(()=>parse(g));
 assert.throws(()=>parseStateGraph(' '.repeat(2*1024*1024+1)));assert.throws(()=>parseStateGraph('{'));assert.throws(()=>parse({version:1,nodes:[],edges:[]}));
});
test('contract/invariant/check links resolve only to their declared kinds',()=>{
 const g=graph();g.nodes.push(node('contract','contract'),node('invariant','invariant'),node('test','test'));g.nodes[1]!.contractRefs=['contract'] as never;g.nodes[1]!.invariantRefs=['invariant'] as never;g.nodes[1]!.checkRefs=['test'] as never;
 assert.equal(parse(g).nodes.length,6);
});

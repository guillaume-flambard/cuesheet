import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ResearchTools, publicUrl, publicAddress } from "../src/adapters/research-tools.ts";
import { EventStore } from "../src/core/store.ts";

test("public transport rejects credentials, local destinations and mapped addresses",()=>{
  for(const address of ["127.0.0.1","10.0.0.1","169.254.169.254","192.168.1.1","100.64.0.1","::1","::ffff:127.0.0.1","fc00::1","2001:db8::1"])assert.equal(publicAddress(address),false,address);
  assert.equal(publicAddress("1.1.1.1"),true);
  assert.equal(publicAddress("2606:4700:4700::1111"),true);
  for(const url of ["http://example.com","https://localhost","https://127.0.0.1","https://user:secret@example.com","https://example.com:8443","https://example.com?access_token=hidden"])
    assert.throws(()=>publicUrl(url));
});

test("a slow signal-ignorant read times out without publishing its late response",async()=>{
  const store=new EventStore("timeout",()=>0);
  const research=new ResearchTools({timeoutMs:5,read:async()=>{
    await new Promise(resolve=>setTimeout(resolve,40));return {status:200,contentType:"text/plain",body:"late"};
  }});
  const result=await research.run(store,{name:"read_document",input:{url:"https://example.com"}},new AbortController().signal);
  assert.equal(result!.exit,2);assert.match(result!.output,/timed out/);
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(store.revision,-1);
});

test("read documents retain source, digest, complete captured text and explicit untrusted provenance",async()=>{
  const store=new EventStore("research",()=>0);
  const research=new ResearchTools({now:()=>42,read:async()=>({status:200,contentType:"text/plain",body:"external content ".repeat(1000)})});
  const result=await research.run(store,{name:"read_document",input:{url:"https://example.com/docs"}},new AbortController().signal);
  assert.equal(result!.exit,0);
  const output=JSON.parse(result!.output);
  assert.equal(output.sourceSeq,1);assert.equal(output.truncated,true);
  const record=store.toSession().events[0]!;
  assert.equal(record.data.fetchedAt,42);assert.equal(record.data.trust,"untrusted external source");
  assert.equal(record.data.text,"external content ".repeat(1000));
  assert.equal(store.toSession().evidence.length,0);
});

test("search is explicitly configured, bounded, and distinguishes snippets from documents",async()=>{
  const store=new EventStore("search",()=>0);
  let calls=0;
  const read=async(url:URL,headers:Record<string,string>)=>{
    calls++;assert.equal(url.hostname,"api.search.brave.com");assert.equal(headers["X-Subscription-Token"],"fixture-key");
    return {status:200,contentType:"application/json",body:JSON.stringify({web:{results:[{title:"Official docs",url:"https://example.com/docs",description:"search snippet"}]}})};
  };
  const unavailable=new ResearchTools({read,apiKey:"fixture-key"});
  assert.equal((await unavailable.run(store,{name:"search_web",input:{query:"docs"}},new AbortController().signal))!.exit,2);
  assert.equal(calls,0);
  const available=new ResearchTools({read,provider:"brave",apiKey:"fixture-key"});
  const result=await available.run(store,{name:"search_web",input:{query:"official docs"}},new AbortController().signal);
  assert.equal(result!.exit,0);
  assert.equal(JSON.parse(result!.output).results[0].read,false);
  assert.equal(JSON.stringify(store.toSession().events).includes("fixture-key"),false);
});

test("unsafe redirects, errors and late cancelled reads cannot publish sources",async()=>{
  const store=new EventStore("refusals",()=>0);
  const redirect=new ResearchTools({read:async()=>({status:302,contentType:"text/plain",location:"https://127.0.0.1",body:""})});
  assert.equal((await redirect.run(store,{name:"read_document",input:{url:"https://example.com"}},new AbortController().signal))!.exit,2);
  const error=new ResearchTools({read:async()=>({status:429,contentType:"text/plain",body:"secret-error"})});
  const failed=await error.run(store,{name:"read_document",input:{url:"https://example.com"}},new AbortController().signal);
  assert.equal(failed!.exit,2);assert.equal(failed!.output.includes("secret-error"),false);
  const controller=new AbortController();
  const late=new ResearchTools({read:async()=>{controller.abort(new Error("stop"));return {status:200,contentType:"text/plain",body:"late"};}});
  await assert.rejects(()=>late.run(store,{name:"read_document",input:{url:"https://example.com"}},controller.signal),/stop/);
  assert.equal(store.revision,-1);
});

test("document cache is dated, durable, hash-checked and never disguises a failed refresh",async()=>{
  const store=new EventStore("cache",()=>0);let now=1000;let reads=0;let body="version one";let status=200;
  const read=async()=>{reads++;return {status,contentType:"text/plain",body};};
  const call={name:"read_document",input:{url:"https://docs.example.com/version",maxAgeMs:100}};
  const signal=new AbortController().signal;
  const first=new ResearchTools({read,now:()=>now});
  assert.equal((await first.run(store,call,signal))!.exit,0);
  const revision=store.revision;now=1050;
  const restarted=new ResearchTools({read,now:()=>now});
  const hit=JSON.parse((await restarted.run(store,call,signal))!.output);
  assert.equal(hit.cached,true);assert.equal(hit.ageMs,50);assert.equal(reads,1);assert.equal(store.revision,revision);
  now=1200;body="version two";
  const refreshed=JSON.parse((await restarted.run(store,call,signal))!.output);
  assert.equal(refreshed.cached,false);assert.equal(refreshed.changed,true);assert.equal(refreshed.previousSourceSeq,hit.sourceSeq);assert.equal(reads,2);
  now=1250;
  const forced=await restarted.run(store,{name:call.name,input:{url:call.input.url,maxAgeMs:0}},signal);
  assert.equal(JSON.parse(forced!.output).cached,false);assert.equal(reads,3);
  store.append({kind:"note",subject:"terminal.research",data:{version:1,operation:"document",url:call.input.url,finalUrl:call.input.url,text:"tampered",digest:"wrong",fetchedAt:now}});
  assert.equal(JSON.parse((await restarted.run(store,call,signal))!.output).cached,false);assert.equal(reads,4);
  now=1500;status=503;const before=store.revision;
  assert.equal((await restarted.run(store,call,signal))!.exit,2);assert.equal(store.revision,before);
  for(const maxAgeMs of [-1,86400001,"100",NaN])assert.equal((await restarted.run(store,{name:call.name,input:{url:call.input.url,maxAgeMs}},signal))!.exit,2);
});

test("local documents are attributed, bounded and confined without importing secrets or binary data",async()=>{
  const base=mkdtempSync(join(tmpdir(),"cuesheet-local-research-"));
  try{
    const root=join(base,"work");mkdirSync(root);const outside=join(base,"outside.md");writeFileSync(outside,"outside");
    writeFileSync(join(root,"guide.md"),"# Project guide\nSource text");symlinkSync(outside,join(root,"escape.md"));
    writeFileSync(join(root,".env"),"secret fixture");writeFileSync(join(root,"binary"),Buffer.from([0,255]));
    writeFileSync(join(root,"large.md"),"x".repeat(262145));writeFileSync(join(root,"invalid-utf8"),Buffer.from([255]));
    const store=new EventStore("local",()=>0);let network=0;
    const tools=new ResearchTools({root,read:async()=>{network++;throw new Error("unexpected network");},now:()=>42});
    const signal=new AbortController().signal;
    const result=await tools.run(store,{name:"read_document",input:{path:"guide.md"}},signal);
    assert.equal(result!.exit,0);assert.equal(JSON.parse(result!.output).path,realpathSync(join(root,"guide.md")));
    assert.equal(store.toSession().events[0]!.data.text,"# Project guide\nSource text");
    const before=store.revision;
    for(const path of ["../outside.md","escape.md",".env","binary","large.md","invalid-utf8"])
      assert.equal((await tools.run(store,{name:"read_document",input:{path}},signal))!.exit,2,path);
    assert.equal((await tools.run(store,{name:"read_document",input:{path:"guide.md",url:"https://example.com"}},signal))!.exit,2);
    const stopped=new AbortController();stopped.abort();await assert.rejects(()=>tools.run(store,{name:"read_document",input:{path:"guide.md"}},stopped.signal));
    assert.equal(store.revision,before);assert.equal(network,0);assert.equal(store.toSession().evidence.length,0);
  }finally{rmSync(base,{recursive:true,force:true});}
});

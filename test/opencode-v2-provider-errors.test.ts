import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseProposal} from '../src/adapters/binary-model.ts';

const refusal=(error:Record<string,unknown>)=>({stdout:JSON.stringify({type:'error',error})+'\n',
  stderr:'do-not-leak-provider-payload',exit:1,signal:null});

test('OpenCode v2 errors are actionable and never expose their provider payloads',()=>{
  const secret='do-not-leak-provider-payload';
  for(const [error,expected] of [
    [{type:'provider.no-route',message:'Model unavailable: google/test '+secret},/Modèle non accessible/],
    [{type:'provider.auth',status:403,message:"OpenCode's free tier can only be used from within OpenCode"},/HTTP 403.*free tier/],
    [{type:'provider.invalid-request',status:410,message:'Model retired '+secret},/HTTP 410/],
    [{type:'provider.rate-limit',status:429,message:'quota '+secret},/HTTP 429/],
  ] as const) {
    assert.throws(()=>parseProposal(refusal(error)),(cause:unknown)=>{
      const text=cause instanceof Error?cause.message:String(cause);
      return expected.test(text) && !text.includes(secret);
    });
  }
});

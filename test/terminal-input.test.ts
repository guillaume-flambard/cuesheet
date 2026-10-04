import {it} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {terminalInput} from '../apps/terminal/src/terminal-input.ts';

function fixture(){const source=new PassThrough();Object.assign(source,{isTTY:true,setRawMode(){},ref(){},unref(){}});const keyboard=terminalInput(source as any);const take=()=>{const result:{text:string;paste:boolean}[]=[];let chunk;while((chunk=keyboard.input.read())!==null)result.push({text:chunk.toString(),paste:keyboard.input.pasteText!==null});return result;};return {source,keyboard,take};}

it('batched keyboard text and controls remain separate logical packets',()=>{
 const f=fixture();try{f.source.write('first\rsecond\r\x7f\x1b[A');assert.deepEqual(f.take(),[{text:'first',paste:false},{text:'\r',paste:false},{text:'second',paste:false},{text:'\r',paste:false},{text:'\b',paste:false},{text:'\x1b[A',paste:false}]);}finally{f.keyboard.dispose();}
});

it('fragmented Unicode and paste retain text without turning pasted Return into a key',()=>{
 const f=fixture();try{
  const bytes=Buffer.from('é👩‍💻');for(const byte of bytes)f.source.write(Buffer.from([byte]));assert.equal(f.take().map(p=>p.text).join(''),'é👩‍💻');
  for(const text of ['\x1b','[20','0~hello\r','\nworld\t\x03','\x1b[20','1~\r'])f.source.write(text);
  const result=f.take();assert.equal(result.filter(p=>p.paste).map(p=>p.text).join(''),'hello\nworld\t');assert.deepEqual(result.filter(p=>!p.paste),[{text:'\r',paste:false}]);
 }finally{f.keyboard.dispose();}
});

it('mouse wheel packets and standalone Escape remain navigable',async()=>{
 const f=fixture();try{f.source.write('\x1b[<64;1;2M\x1b[<65;1;2M\x1b');assert.deepEqual(f.take().map(p=>p.text),['\x1b[5~','\x1b[6~']);await new Promise(r=>setTimeout(r,30));assert.deepEqual(f.take(),[{text:'\x1b',paste:false}]);}finally{f.keyboard.dispose();}
});

it('ending input flushes Escape without a delayed push after EOF',async()=>{
 const f=fixture();const errors:Error[]=[];f.keyboard.input.on('error',error=>errors.push(error));try{f.source.end('\x1b');await new Promise(r=>setImmediate(r));assert.deepEqual(f.take(),[{text:'\x1b',paste:false}]);await new Promise(r=>setTimeout(r,30));assert.deepEqual(errors,[]);}finally{f.keyboard.dispose();}
});


it('fragmented Mac Option-arrow sequences normalize without altering AZERTY symbols',()=>{
 const f=fixture();try{for(const chunk of ['\x1b[1;','3D','€@','\x1b[1;3','C'])f.source.write(chunk);assert.deepEqual(f.take().map(p=>p.text),['\x1bb','€@','\x1bf']);}finally{f.keyboard.dispose();}
});

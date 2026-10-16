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

// Ink 4's useInput Key has no home/end flag and names no modifier on Ctrl+Left,
// so the terminal's own encoding is the only thing that can make these keys
// work. Every encoding below was measured dead in a real PTY before this map.
it('Home reaches the composer as line start, in every encoding a terminal sends',()=>{
  const f=fixture();try{
    for(const sequence of ['\x1b[H','\x1b[1~','\x1b[7~','\x1bOH'])f.source.write(sequence);
    assert.deepEqual(f.take().map(p=>p.text),['\x01','\x01','\x01','\x01']);
  }finally{f.keyboard.dispose();}
});

it('End reaches the composer as line end, in every encoding a terminal sends',()=>{
  const f=fixture();try{
    for(const sequence of ['\x1b[F','\x1b[4~','\x1b[8~','\x1bOF'])f.source.write(sequence);
    assert.deepEqual(f.take().map(p=>p.text),['\x05','\x05','\x05','\x05']);
  }finally{f.keyboard.dispose();}
});

it('Ctrl and Alt arrows reach word motion as one canonical pair',()=>{
  const f=fixture();try{
    f.source.write('\x1b[1;5D\x1b[1;5C\x1b[1;3D\x1b[1;7C\x1bb\x1bf');
    assert.deepEqual(f.take().map(p=>p.text),['\x1bb','\x1bf','\x1bb','\x1bf','\x1bb','\x1bf']);
  }finally{f.keyboard.dispose();}
});

it('Ctrl+Backspace is the word deletion the composer already implements',()=>{
  const f=fixture();try{
    f.source.write('\x08\x7f\b');
    assert.deepEqual(f.take().map(p=>p.text),['\x17','\x08','\x17']);
  }finally{f.keyboard.dispose();}
});

it('plain arrow keys keep their single-step meaning',()=>{
  const f=fixture();try{
    f.source.write('\x1b[D\x1b[C\x1b[A\x1b[B');
    assert.deepEqual(f.take().map(p=>p.text),['\x1b[D','\x1b[C','\x1b[A','\x1b[B']);
  }finally{f.keyboard.dispose();}
});

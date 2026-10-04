import {Transform} from 'node:stream';
import {StringDecoder} from 'node:string_decoder';
type Packet=Buffer&{pasteText?:string};
export type TerminalReadStream=NodeJS.ReadStream&{pasteText:string|null};

/** Logical packets stay separate even when Ink reads an entire buffered burst. */
export function terminalInput(source:NodeJS.ReadStream):{input:TerminalReadStream;dispose():void} {
  const decoder=new StringDecoder('utf8');
  let pending='',pasting=false,pasteLastCR=false,escapeTimer:ReturnType<typeof setTimeout>|undefined;
  const start='\x1b[200~',end='\x1b[201~';
  const packet=(text:string,paste=false)=>{
    if(!text)return;
    const joined=paste&&pasteLastCR&&text.startsWith('\n')?text.slice(1):text;
    const normalized=paste?joined.replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,''):text;
    if(paste)pasteLastCR=text.endsWith('\r');
    if(!normalized)return;
    const bytes=Buffer.from(normalized) as Packet;
    if(paste)bytes.pasteText=normalized;
    stream.push(bytes);
  };
  const drain=()=>{
    if(escapeTimer){clearTimeout(escapeTimer);escapeTimer=undefined;}
    while(pending){
      if(pasting){
        const at=pending.indexOf(end);
        if(at>=0){packet(pending.slice(0,at),true);pending=pending.slice(at+end.length);pasting=false;continue;}
        let held=0;for(let n=1;n<end.length;n++)if(pending.endsWith(end.slice(0,n)))held=n;
        packet(pending.slice(0,pending.length-held),true);pending=held?pending.slice(-held):'';return;
      }
      if(pending.startsWith(start)){pending=pending.slice(start.length);pasting=true;pasteLastCR=false;continue;}
      if(pending[0]==='\x1b'){
        if(pending==='\x1b'){
          escapeTimer=setTimeout(()=>{escapeTimer=undefined;if(pending==='\x1b'){pending='';packet('\x1b');}},20);return;
        }
        if(start.startsWith(pending))return;
        const csi=pending.match(/^\x1b\[[0-?]*[ -/]*[@-~]/);
        if(csi){
          const sequence=csi[0];pending=pending.slice(sequence.length);
          const mouse=sequence.match(/^\x1b\[<(\d+);\d+;\d+[mM]$/);
          if(mouse){const code=Number(mouse[1]);if(code&64)packet(code&1?'\x1b[6~':'\x1b[5~');}else if(/^\x1b\[1;[35]D$/.test(sequence))packet("\x1bb");else if(/^\x1b\[1;[35]C$/.test(sequence))packet("\x1bf");else packet(sequence);
          continue;
        }
        if(pending.startsWith('\x1b[')||pending==='\x1bO')return;
        const length=pending.startsWith('\x1bO')?3:2;packet(pending.slice(0,length));pending=pending.slice(length);continue;
      }
      const control=pending.search(/[\x00-\x1f\x7f]/);
      if(control===-1){packet(pending);pending='';continue;}
      if(control>0){packet(pending.slice(0,control));pending=pending.slice(control);continue;}
      packet(pending[0]==='\x7f'?'\x08':pending[0]);pending=pending.slice(1);
    }
  };
  const stream=new Transform({readableObjectMode:true,transform(chunk:Buffer,_encoding,callback){pending+=decoder.write(chunk);drain();callback();},flush(callback){
    pending+=decoder.end();drain();
    if(escapeTimer){clearTimeout(escapeTimer);escapeTimer=undefined;}
    if(pending){packet(pending,pasting);pending='';}
    callback();
  }});
  const input=stream as unknown as TerminalReadStream;
  input.pasteText=null;
  const read=stream.read.bind(stream);
  stream.read=(size?:number)=>{const value=read(size) as Packet|null;if(value)input.pasteText=value.pasteText??null;return value;};
  input.isTTY=source.isTTY;
  input.setRawMode=(mode:boolean)=>{source.setRawMode(mode);return input;};
  input.ref=()=>{source.ref();return input;};
  input.unref=()=>{source.unref();return input;};
  source.pipe(stream);
  return {input,dispose(){if(escapeTimer)clearTimeout(escapeTimer);source.unpipe(stream);stream.destroy();}};
}

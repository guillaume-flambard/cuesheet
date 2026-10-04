/** Cursor positions count graphemes, so deletion does not split an emoji. */
export const characters = (text: string): string[] =>
  [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);

export type Edit = "left" | "right" | "home" | "end" | "backspace" | "delete" | "clear" | "word-left" | "word-right" | "word-backspace";
export function edit(text: string, cursor: number, action: Edit | { insert: string }): { text: string; cursor: number } {
  const chars = characters(text);
  let at = Math.max(0, Math.min(cursor, chars.length));
  if (typeof action === "object") {
    const inserted = characters(action.insert.replace(/\r\n?/g, "\n"));
    chars.splice(at, 0, ...inserted); at += inserted.length;
  } else if (action === "left") at = Math.max(0, at - 1);
  else if (action === "right") at = Math.min(chars.length, at + 1);
  else if (action === "word-left" || action === "word-backspace") {const end=at;while(at>0&&/\s/u.test(chars[at-1]!))at--;while(at>0&&!/\s/u.test(chars[at-1]!))at--;if(action==="word-backspace")chars.splice(at,end-at);}
  else if (action === "word-right") {while(at<chars.length&&!/\s/u.test(chars[at]!))at++;while(at<chars.length&&/\s/u.test(chars[at]!))at++;}
  else if (action === "home") at = 0;
  else if (action === "end") at = chars.length;
  else if (action === "backspace" && at > 0) chars.splice(--at, 1);
  else if (action === "delete") chars.splice(at, 1);
  else if (action === "clear") { chars.length = 0; at = 0; }
  return { text: chars.join(""), cursor: at };
}

/** Terminal cells, including joined emoji and combining graphemes. */
export function cellWidth(text:string):number {
 return characters(text).reduce((n,c)=>n+(/\p{Extended_Pictographic}/u.test(c)||/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]/u.test(c)?2:/^\p{Mark}+$/u.test(c)?0:1),0);
}
/** A single row keeps the cursor visible without changing the stored draft. */
export function editorView(text:string,cursor:number,width:number):{before:string;cursor:string;after:string;cells:number} {
 const chars=characters(text.replace(/\n/g,'↵')),at=Math.min(Math.max(0,cursor),chars.length),limit=Math.max(3,width);
 let start=0;
 while(start<at&&cellWidth(chars.slice(start,at).join(''))+(start?1:0)+cellWidth(chars[at]??' ')+(at+1<chars.length?1:0)>limit)start++;
 const current=chars[at]??' ';
 const prefix=start&&cellWidth(current)+(at+1<chars.length?1:0)+1<=limit?'‹':'';
 const before=prefix+chars.slice(start,at).join('');let end=at+1;
 while(end<chars.length&&cellWidth(before+current+chars.slice(at+1,end+1).join(''))+(end+1<chars.length?1:0)<=limit)end++;
 const after=chars.slice(at+1,end).join('')+(end<chars.length?'›':'');
 return {before,cursor:current,after,cells:cellWidth(before+current+after)};
}

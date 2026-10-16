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
 return characters(text).reduce((n,c)=>n+(/\p{Extended_Pictographic}/u.test(c)||/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]/u.test(c)?2:/^\p{Mark}+$/u.test(c)?0:1),1);
}

/**
 * A selection is an ordered, inclusive-exclusive grapheme range.
 *
 * The anchor is where the selection started and the cursor is where it ended.
 * Only the ordered pair is rendered, so growing a selection leftwards and then
 * rightwards produces the same range at the same length.
 */
export function selectRange(anchor:number,cursor:number):{start:number;end:number} {
 return anchor<=cursor?{start:anchor,end:cursor}:{start:cursor,end:anchor};
}

/** Removing a selection leaves the cursor at the start of the removed range. */
export function removeRange(text:string,range:{start:number;end:number}):{text:string;cursor:number} {
 const chars=characters(text);
 const start=Math.max(0,Math.min(range.start,chars.length)),end=Math.max(start,Math.min(range.end,chars.length));
 chars.splice(start,end-start);
 return {text:chars.join(''),cursor:start};
}

/**
 * One row window, optionally highlighting the selected graphemes.
 *
 * The single row is fixed by the product direction: the input is the anchor
 * `> _` and never moves. A selection is the honest way a draft shows more than
 * one cell of intent without growing the line. The window is the smallest span
 * that contains the selection and the cursor block inside the cell budget, so a
 * long draft scrolls rather than hiding the insertion point.
 */
export function editorView(text:string,cursor:number,width:number,range?:{start:number;end:number}):{before:string;first:string;second:string;after:string;cells:number;cursorFirst:boolean} {
 const chars=characters(text.replace(/\n/g,'\u21b5')),at=Math.min(Math.max(0,cursor),chars.length),limit=Math.max(3,width);
 const span=range?selectRange(range.start,range.end):{start:at,end:at};
 const start=Math.max(0,Math.min(span.start,chars.length)),end=Math.max(start,Math.min(span.end,chars.length));
 let from=0,to=chars.length;
 while(from<start&&cellWidth(chars.slice(from,to).join(''))>limit)from++;
 while(to>end&&cellWidth(chars.slice(from,to).join(''))>limit)to--;
 // The block carries the cursor. With the cursor at the right edge of a
 // selection the block is the character just past it; at the left edge it is
 // the range's own first character. Either way the two segments together cover
 // exactly the selected graphemes once, in render order.
 const right=at>=end;
 const prefix=from>0?'\u2039':'',suffix=to<chars.length?'\u203a':'';
 const before=prefix+chars.slice(from,start).join('');
 const selected=chars.slice(right?start:start+1,right?end:end).join('');
 const block=chars[right?end:start]??' ';
 const after=chars.slice(right?end+1:end,to).join('')+suffix;
 return right
  ?{before,first:selected,second:block,after,cells:cellWidth(before+selected+block+after),cursorFirst:false}
  :{before,first:block,second:selected,after,cells:cellWidth(before+block+selected+after),cursorFirst:true};
}

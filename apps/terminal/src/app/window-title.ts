import {characters,cellWidth} from "../components/editor.ts";

/**
 * The terminal window title, taken from the one thing the session is working on.
 *
 * The text is written inside an OSC sequence, so control characters are removed
 * rather than passed through: a task that carried a BEL or an ESC would end the
 * sequence early and let whatever followed run as terminal commands. That is
 * injection, not formatting, and it is why this is a function with a test rather
 * than a template string at the call site.
 */
export function windowTitle(input:{intent?:string|null;project?:string|null},maxCells=72):string {
 const single=(text:string|undefined|null)=>characters(text??"")
  .map(c=>{const code=c.codePointAt(0)??0;return code<32||code===127||(code>=128&&code<=159)?" ":c;})
  .join("").replace(/\s+/g," ").trim();
 const task=single(input.intent),project=single(input.project);
 if(!task&&!project)return "cuesheet";
 const label=["cuesheet",task||project].join(" · ");
 let cells=0,out="";
 for(const c of characters(label)){
  const size=cellWidth(c);
  if(cells+size>maxCells-1){out=out.replace(/\s+$/,"")+"…";break;}
  out+=c;cells+=size;
 }
 return out;
}

/** OSC 0 sets both the icon name and the title; an empty payload restores it. */
export function oscTitle(title:string):string {
 return `\u001b]0;${title.replace(/[\u0000-\u001f\u007f-\u009f]/g," ").replace(/\s+/g," ").trim()}\u0007`;
}

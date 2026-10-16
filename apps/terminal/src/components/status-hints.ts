/**
 * The one keyboard line, in priority order.
 *
 * The interrupt is never dropped while work runs. The narrow branch used to
 * show only the shortcuts below sixty columns, so a long run with three
 * shortcuts and no stop had no visible way out; there the stop goes first and
 * the rest is dropped rather than letting truncation eat the guide.
 */
export function statusHints(input:{overlay?:string;targeted?:boolean;busy:boolean;width:number}):string {
 const {overlay="none",targeted=false,busy,width}=input;
 if(overlay!=="none") return "Esc back · inspection keeps your draft";
 if(targeted) return "Enter correct selected work · Esc detach target";
 if(width<60) return busy?"Ctrl+C stop · Ctrl+K commands":"Ctrl+P models · Ctrl+K commands";
 return `${busy?"Enter redirect · Ctrl+C stop":"Enter send"} · Tab inspect · Ctrl+P models · Ctrl+K commands`;
}

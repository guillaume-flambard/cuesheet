import type {ContextFrame} from '../core/loop.ts';
/** Current controller declaration, never a union of historical availability. */
export function declaredTools(frame:Pick<ContextFrame,'directives'>):string[]|null{
 let latest=-1;let vocabulary:string[]|null=null;
 for(const directive of frame.directives){
  if(!Number.isSafeInteger(directive.seq)||directive.seq<0)continue;
  const match=/^tools:[ \t]*([a-z0-9_, \t-]+)$/.exec(directive.text);if(!match)continue;
  const names=[...new Set(match[1]!.split(',').map(name=>name.trim()).filter(Boolean))];
  if(!names.length||!names.every(name=>/^[a-z][a-z0-9_-]{0,63}$/.test(name)))continue;
  if(directive.seq===latest && JSON.stringify(vocabulary)!==JSON.stringify(names))throw new Error('Contradictory tool declarations at the same source sequence.');
  if(directive.seq>=latest){latest=directive.seq;vocabulary=names;}
 }
 return vocabulary;
}

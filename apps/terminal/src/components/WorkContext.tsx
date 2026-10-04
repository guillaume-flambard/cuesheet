import React from 'react';
import {Box,Text} from 'ink';
import type {WorkSurface} from '../app/state.ts';
import {useMotionPulse} from '../theme/motion.tsx';
import {theme,inkColor,blend} from '../theme/tokens.ts';

/** Current semantic context stays visible while the outcome viewport scrolls. */
export function contextLines(surface:WorkSurface|undefined,budget:number):string[] {
  if(!surface?.intent || budget<1)return [];
  const lines=[`direction · ${surface.intent.replace(/\s+/g,' ')}`];
  const correction=surface.corrections.at(-1);
  if(correction)lines.push(`↳ direction · ${correction.replace(/\s+/g,' ')}`);
  if(surface.criteria?.length&&budget>=5)lines.push(`success · ${surface.criteria[0]!.replace(/\s+/g,' ')}`);
  const work=[...surface.workers.map(w=>{
    const labels:Record<string,string>={active:'running',result:'proposal · unverified',failed:'failed',stale:'stale',cancelled:'cancelled',interrupted:'interrupted'};
    return `${w.label} · ${w.task}${w.helping?' · helping '+(w.helping==='coordinator'?'main task':w.helping):''} · ${labels[w.phase]??'unknown'}`;
  }),...surface.tasks.map(t=>`○ planned · ${t.text}`)];
  const room=budget-lines.length-1;
  if(work.length && room>0){
    lines.push('work');
    const shown=work.slice(0,room);
    shown.forEach((line,i)=>lines.push(`  ${i===shown.length-1?'└─':'├─'} ${line.replace(/\s+/g,' ')}`));
  }
  return lines.slice(0,budget);
}

export function WorkContext({lines}:{lines:readonly string[]}):JSX.Element {
  return <Box flexDirection="column" flexShrink={0}>{lines.map((line,i)=><WorkLine key={i} line={line}/>)}</Box>;
}

function WorkLine({line}:{line:string}):JSX.Element {
 const pulse=useMotionPulse(line,/running/.test(line));const base=/failed|interrupted/.test(line)?theme.failed:/unknown|unverified|stale/.test(line)?theme.unknown:/running/.test(line)?theme.active:theme.dim;
 if(line==='work')return <Text bold color={inkColor(theme.dim)}>work</Text>;
 const branch=line.match(/^(\s*[├└]─)\s+([^·]+)·(.*)$/);
 return <Text wrap="truncate-end" color={inkColor(blend(/running/.test(line)?theme.faint:theme.active,base,pulse))}>{branch?<><Text color={inkColor(theme.rule)}>{branch[1]} </Text><Text bold>{branch[2]?.trim()}</Text><Text color={inkColor(theme.dim)}> · {branch[3]?.trim()}</Text></>:line}</Text>;
}

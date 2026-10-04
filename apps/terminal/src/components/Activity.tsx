import React,{useEffect,useState} from 'react';
import {Box,Text} from 'ink';
import type {Entry} from '../app/state.ts';
import {useMotion} from '../theme/motion.tsx';
import {theme,inkColor} from '../theme/tokens.ts';

/** A public activity summary from real tool events; no synthetic thought log. */
export function Activity({busy,entries,width,progressKind}:{busy:boolean;entries:readonly Entry[];width:number;progressKind?:"reasoning"|"text"}):JSX.Element {
 const motion=useMotion(),[elapsed,setElapsed]=useState(0);
 useEffect(()=>{
  if(!busy){setElapsed(0);return;}
  const started=Date.now();setElapsed(0);
  const timer=setInterval(()=>setElapsed(Date.now()-started),motion?160:1000);
  return ()=>clearInterval(timer);
 },[busy,motion]);
 const current=entries.slice(entries.findLastIndex(e=>e.kind==='you')+1);
 const action=current.findLast(e=>e.kind==='action'&&e.certainty==='active');
 const label=action?.kind==='action'?`${action.label}${action.detail?' · '+action.detail:''}`:progressKind==='text'?'Receiving response':'Waiting for model';
 const marker=!motion?'●':Math.floor(elapsed/640)%2?'◐':'●';
 return <Box width={width} height={1} flexShrink={0}><Text wrap="truncate-end" color={inkColor(theme.faint)}>{busy?`${marker} ${label} · ${Math.floor(elapsed/1000)} s · Tab inspect`:' '}</Text></Box>;
}

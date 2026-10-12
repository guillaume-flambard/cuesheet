import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { filterSessionChoices } from './session-search.ts';
export interface SessionChoice { id:string;cwd:string;goal:string;lastAt:number;damaged:boolean; }
export function Sessions(props:{rows:number;current?:string;list():SessionChoice[];onChoose(id:string):void;}):JSX.Element {
  const result=useMemo(()=>{try{return {items:props.list().slice(0,500),error:''};}catch{return {items:[],error:'Lecture des sessions impossible.'};}},[props.list]);
  const [at,setAt]=useState(0);
  const [query,setQuery]=useState('');
  const matching=filterSessionChoices(result.items,query);
  const visible=Math.max(1,props.rows-2);
  const start=Math.max(0,at-visible+1);
  useInput((input,key)=>{
    if(key.upArrow) return setAt(index=>Math.max(0,index-1));
    if(key.downArrow) return setAt(index=>Math.min(Math.max(0,matching.length-1),index+1));
    if(key.ctrl && input==='u'){setQuery('');setAt(0);return;}
    if(key.backspace || key.delete){setQuery(value=>Array.from(value).slice(0,-1).join(''));setAt(0);return;}
    if(key.return){if(matching[at])props.onChoose(matching[at]!.id);return;}
    if(!key.ctrl&&!key.meta&&input&&!key.escape){setQuery(value=>value+input);setAt(0);}
  });
  return <Box flexDirection="column" height={props.rows} overflow="hidden">
    <Text bold wrap="truncate-end">Sessions · {matching.length}/{result.items.length}{query?' · '+query:' · taper pour filtrer'}</Text>
    {matching.slice(start,start+visible).map((item,index)=><Text key={item.id} wrap="truncate-end">{start+index===at?'› ':'  '}{item.id===props.current?'● ':''}{item.damaged?'endommagée · ':''}{item.goal} · {item.cwd}</Text>)}
    {!matching.length&&<Text dimColor>Aucune session correspondante · Ctrl+U effacer</Text>}
    <Text dimColor wrap="truncate-end">{result.error || (result.items.length?'↑↓ choisir · Entrée ouvrir · Esc retour · Ctrl+U effacer':'Aucune session sauvegardée · Esc : retour')}</Text>
  </Box>;
}

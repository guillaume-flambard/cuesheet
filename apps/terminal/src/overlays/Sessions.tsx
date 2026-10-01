import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
export interface SessionChoice { id:string;cwd:string;goal:string;lastAt:number;damaged:boolean; }
export function Sessions(props:{rows:number;current?:string;list():SessionChoice[];onChoose(id:string):void;}):JSX.Element {
  const result=useMemo(()=>{try{return {items:props.list().slice(0,100),error:''};}catch{return {items:[],error:'Lecture des sessions impossible.'};}},[props.list]);
  const [at,setAt]=useState(0);
  const visible=Math.max(1,props.rows-2);
  const start=Math.max(0,at-visible+1);
  useInput((_input,key)=>{
    if(key.upArrow) setAt(index=>Math.max(0,index-1));
    if(key.downArrow) setAt(index=>Math.min(result.items.length-1,index+1));
    if(key.return && result.items[at]) props.onChoose(result.items[at]!.id);
  });
  return <Box flexDirection="column" height={props.rows} overflow="hidden">
    <Text bold wrap="truncate-end">Sessions · {result.items.length}</Text>
    {result.items.slice(start,start+visible).map((item,index)=><Text key={item.id} wrap="truncate-end">{start+index===at?'› ':'  '}{item.id===props.current?'● ':''}{item.damaged?'endommagée · ':''}{item.goal} · {item.cwd}</Text>)}
    <Text dimColor wrap="truncate-end">{result.error || (result.items.length?'↑↓ : choisir · Entrée : ouvrir · Esc : retour':'Aucune session sauvegardée · Esc : retour')}</Text>
  </Box>;
}

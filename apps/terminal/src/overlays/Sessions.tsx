import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {SelectionRow,ViewTitle} from '../components/Surface.tsx';
import {theme,inkColor} from '../theme/tokens.ts';
export interface SessionChoice { id:string;cwd:string;goal:string;lastAt:number;damaged:boolean; }
export function Sessions(props:{width?:number;rows:number;current?:string;list():SessionChoice[];onChoose(id:string):void;}):JSX.Element {
  const result=useMemo(()=>{try{return {items:props.list().slice(0,100),error:''};}catch{return {items:[],error:'Unable to read sessions.'};}},[props.list]);
  const [at,setAt]=useState(0);
  const visible=Math.max(1,Math.min(8,props.rows-4));
  const start=Math.max(0,at-visible+1);
  useInput((_input,key)=>{
    if(key.upArrow) setAt(index=>Math.max(0,index-1));
    if(key.downArrow) setAt(index=>Math.min(result.items.length-1,index+1));
    if(key.return && result.items[at]) props.onChoose(result.items[at]!.id);
  });
  return <Box flexDirection="column" height={props.rows} overflow="hidden">
    <ViewTitle title="Sessions" detail={`${result.items.length} preserved`}/>
    {result.items.slice(start,start+visible).map((item,index)=><SelectionRow key={item.id} width={props.width??64} selected={start+index===at} label={`${item.damaged?'damaged · ':''}${item.goal||'Untitled intention'}`} detail={item.id===props.current?'current':item.cwd.split('/').filter(Boolean).at(-1)??''}/>)}
    <Text color={inkColor(result.error?theme.failed:theme.faint)} wrap="truncate-end">{result.error || (result.items.length?'↑↓: choose · Enter: open · Esc: back':'No saved sessions · Esc: back')}</Text>
  </Box>;
}

import React,{useState} from 'react';
import {Box,Text,useInput} from 'ink';
import {Models,type ModelsProps} from './Models.tsx';
import {SelectionRow,ViewTitle} from '../components/Surface.tsx';
import {theme,inkColor} from '../theme/tokens.ts';
import type {ModelPreferences} from '../../../../src/adapters/model-preferences.ts';
export function AgentModels(props:{width?:number;rows:number;busy:boolean;targets():Array<{role:string;selection:ModelPreferences|null;label:string}>;apply(role:string,choice:ModelPreferences|null):{ok:true}|{error:string};list:ModelsProps['list'];onClose():void}):JSX.Element{
 const [,refresh]=useState(0);
 const [at,setAt]=useState(0),[role,setRole]=useState<string|null>(null),[error,setError]=useState('');let targets:ReturnType<typeof props.targets>=[];
 try{targets=props.targets();}catch{targets=[];}
 const selected=Math.min(at,Math.max(0,targets.length-1));const visible=Math.max(1,Math.min(8,props.rows-4)),start=Math.max(0,selected-visible+1);
 useInput((text,key)=>{
  if(role!==null)return;if(key.escape)return props.onClose();
  if(key.downArrow)setAt(i=>Math.min(targets.length-1,i+1));if(key.upArrow)setAt(i=>Math.max(0,i-1));
  const target=targets[selected];if(!target)return;
  if(text.toLowerCase()==='a'){const result=props.apply(target.role,null);if('error' in result)setError(result.error);else {setError('');refresh(n=>n+1);}}
  if(key.return){setRole(target.role);setError('');}
 });
 if(role!==null)return <Models width={props.width} titlePrefix={role==='*'?'All consultants':role} selection={targets.find(t=>t.role===role)?.selection??{}} rows={props.rows} busy={props.busy} list={props.list} sessionOnly apply={choice=>props.apply(role,choice)} onClose={props.onClose}/>;
 return <Box flexDirection="column" height={props.rows} overflow="hidden">
  <ViewTitle title="Agent models" detail={`${targets.length} roles`}/>
  {targets.slice(start,start+visible).map((t,i)=><SelectionRow key={t.role} width={props.width??64} selected={start+i===selected} label={`${t.role==='*'?'All consultants':t.role} · ${t.label}`}/>)}
  <Text color={inkColor(error?theme.failed:theme.faint)} wrap="truncate-end">{error||(targets.length?'Enter: choose · A: automatic · Esc: close':'Session routes unavailable.')}</Text>
 </Box>;
}

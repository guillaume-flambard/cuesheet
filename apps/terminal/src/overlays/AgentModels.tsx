import React,{useState} from 'react';
import {Box,Text,useInput} from 'ink';
import {Models,type ModelsProps} from './Models.tsx';
import type {ModelPreferences} from '../../../../src/adapters/model-preferences.ts';
export function AgentModels(props:{rows:number;busy:boolean;targets():Array<{role:string;selection:ModelPreferences|null;label:string}>;apply(role:string,choice:ModelPreferences|null):{ok:true}|{error:string};list:ModelsProps['list'];onClose():void}):JSX.Element{
 const [,refresh]=useState(0);
 const [at,setAt]=useState(0),[role,setRole]=useState<string|null>(null),[error,setError]=useState('');let targets:ReturnType<typeof props.targets>=[];
 try{targets=props.targets();}catch{targets=[];}
 const selected=Math.min(at,Math.max(0,targets.length-1));const visible=Math.max(1,props.rows-3),start=Math.max(0,selected-visible+1);
 useInput((text,key)=>{
  if(role!==null)return;if(key.escape)return props.onClose();
  if(key.downArrow)setAt(i=>Math.min(targets.length-1,i+1));if(key.upArrow)setAt(i=>Math.max(0,i-1));
  const target=targets[selected];if(!target)return;
  if(text.toLowerCase()==='a'){const result=props.apply(target.role,null);if('error' in result)setError(result.error);else {setError('');refresh(n=>n+1);}}
  if(key.return){setRole(target.role);setError('');}
 });
 if(role!==null)return <Models titlePrefix={role==='*'?'Tous les consultants':role} selection={targets.find(t=>t.role===role)?.selection??{}} rows={props.rows} busy={props.busy} list={props.list} sessionOnly apply={choice=>props.apply(role,choice)} onClose={props.onClose}/>;
 return <Box flexDirection="column" height={props.rows} overflow="hidden">
  <Text bold wrap="truncate-end">Modèles des agents</Text>
  {targets.slice(start,start+visible).map((t,i)=><Text key={t.role} wrap="truncate-end">{start+i===selected?'› ':'  '}{t.role==='*'?'Tous les consultants':t.role} · {t.label}</Text>)}
  <Text dimColor wrap="truncate-end">{error||(targets.length?'Entrée : choisir · A : automatique · Esc : fermer':'Routes de session indisponibles.')}</Text>
 </Box>;
}

import React,{useState,useEffect,useRef} from 'react';
import {Box,Text,useInput} from 'ink';
import type {Entry,WorkSurface,WorkReference} from '../app/state.ts';
import {SelectionRow,ViewTitle} from '../components/Surface.tsx';
import {wrapCells} from '../components/LiveWork.tsx';
import {theme,inkColor} from '../theme/tokens.ts';

type Item={id:string;title:string;status:string;detail:string;kind?:string;reference?:WorkReference};
/** Display records, never infer help relationships or proof from agent prose. */
export function workItems(entries:readonly Entry[],surface?:WorkSurface):Item[]{
 const phases:Record<string,string>={active:'running',result:'proposal · unverified',failed:'failed',stale:'stale',cancelled:'cancelled',interrupted:'interrupted'};
 const workers=(surface?.workers??[]).map(w=>({id:'worker:'+w.id,title:w.task,status:phases[w.phase]??'unknown',detail:[`${w.label} · ${w.role}`,w.task,`State: ${phases[w.phase]??'unknown'}`,`Model: ${w.model??'not recorded'}`,w.helping?`Helping: ${w.helping==='coordinator'?'main task':w.helping}`:'',w.routeReason?`Why this model: ${w.routeReason}`:'',w.source?`Journal source #${w.source}`:'',w.result||'No result recorded.','Agent output is not independent verification.'].filter(Boolean).join('\n')}));
 const start=entries.findLastIndex(e=>e.kind==='you');
 const actions=entries.slice(start+1).flatMap(e=>e.kind==='action'?[{id:e.id,title:e.label,status:e.certainty==='confirmed'?'executed':e.certainty==='active'?'running':e.certainty,detail:[e.label,e.detail||'No additional detail recorded.',`State: ${e.certainty==='confirmed'?'execution confirmed; task verification is separate':e.certainty}`,`Record: ${e.id}`].join('\n')}]:[]);
 return surface?.objects?[...surface.objects,...actions]:[...workers,...actions];
}
export function Work({entries,surface,width,rows,onOpen,active=true,onRedirect,onReference}:{entries:readonly Entry[];surface?:WorkSurface;width:number;rows:number;onOpen(target:'changes'|'models'|'context'|'inspect'):void;active?:boolean;onRedirect?():void;onReference?(reference:WorkReference,title:string):void}):JSX.Element{
 const [filter,setFilter]=useState<'all'|'work'|'results'>('all');
 const all=workItems(entries,surface);
 const items=all.filter(i=>filter==='all'||filter==='work'&&['plan','task','agent'].includes(i.kind??'agent')||filter==='results'&&(['contribution','verification'].includes(i.kind??'')||/proposal|executed|failed/.test(i.status)));
 const [selected,setSelected]=useState<string|null>(null),[expanded,setExpanded]=useState(false),[offset,setOffset]=useState(0);
 const remembered=useRef<Item|undefined>(undefined);
 const found=items.findIndex(i=>i.id===selected),index=Math.max(0,found);
 const current=selected===null?items[0]:items[found];
 if(current)remembered.current=current;
 const item=current??remembered.current;
 const outdated=!!selected&&!current;
 const budget=Math.max(1,rows-5),lines=item?wrapCells((outdated?'This work left the current scope. Showing its last recorded detail.\n':'')+item.detail,width):[];
 const top=Math.min(offset,Math.max(0,lines.length-budget));
 useInput((input,key)=>{
  if(!active||key.ctrl||key.meta||key.escape)return;
  if(['1','2','3'].includes(input)){setFilter(input==='1'?'all':input==='2'?'work':'results');setSelected(null);remembered.current=undefined;setExpanded(false);setOffset(0);return;}
  if(input.toLowerCase()==='f'&&item?.reference&&!outdated)return onReference?.(item.reference,item.title);
  if(input.toLowerCase()==='r')return onRedirect?.();
  if(input==='d')return onOpen('changes');if(input==='m')return onOpen('models');if(input==='c')return onOpen('context');if(input==='l')return onOpen('inspect');
  if(key.return){setExpanded(v=>!v);setOffset(0);if(item)setSelected(item.id);return;}
  if(expanded){if(key.downArrow||key.pageDown)setOffset(top+(key.pageDown?budget:1));if(key.upArrow||key.pageUp)setOffset(Math.max(0,top-(key.pageUp?budget:1)));return;}
  const step=key.pageDown?budget:key.pageUp?-budget:key.downArrow?1:key.upArrow?-1:0;
  if(step){const next=items[Math.max(0,Math.min(items.length-1,index+step))];if(next)setSelected(next.id);}
 });
 useEffect(()=>{if(current&&selected===null)setSelected(current.id);},[current?.id,selected]);
 const start=Math.max(0,index-budget+1);
 return <Box width={width} height={rows} flexDirection="column" overflow="hidden">
  <ViewTitle title={expanded?'Work detail':'Work'} detail={outdated?'No longer current':item?`${index+1} / ${items.length}`:'no recorded activity'}/>
  <Text color={inkColor(theme.dim)} wrap="truncate-end">{filter==='all'?'1 All':'1 all'} · {filter==='work'?'2 Work':'2 work'} · {filter==='results'?'3 Results':'3 results'}{surface?.objects?' · intention, work and outcomes':''}</Text>
  <Box height={budget} flexShrink={0} flexDirection="column" overflow="hidden">
   {expanded?lines.slice(top,top+budget).map((line,i)=><Text key={top+i} color={inkColor(theme.text)} wrap="truncate-end">{line||' '}</Text>):items.length?items.slice(start,start+budget).map(i=><SelectionRow key={i.id} width={width} selected={i.id===item?.id} label={`${i.kind?i.kind+' · ':''}${i.title}`} detail={i.status}/>):<Text color={inkColor(theme.dim)}>{filter==='all'?'Actions and agents will appear when recorded.':'No matching work recorded. Press 1 for all.'}</Text>}
  </Box>
  <Text color={inkColor(theme.faint)} wrap="truncate-end">{expanded?'↑↓ / Pg↑↓ scroll · Enter list':'↑↓ choose · Enter detail'} · Esc close</Text>
  <Text color={inkColor(theme.faint)} wrap="truncate-end">{item?.reference&&!outdated?'F target · ':''}D changes · M models · C context · L log · R redirect</Text>
 </Box>;
}

import React,{useEffect,useState} from 'react';
import {Box,Text,useInput} from 'ink';
import type {ChangeReview} from '../../../../src/adapters/worktree-review.ts';
import {ViewTitle} from '../components/Surface.tsx';
import {wrapCells} from '../components/LiveWork.tsx';
import {theme,inkColor} from '../theme/tokens.ts';
export function Changes(props:{width:number;rows:number;load():Promise<ChangeReview|null>;decide(token:string,digest:string,decision:'apply'|'reject'):Promise<{kind:string;files:number;reason?:string}>;busy:boolean}):JSX.Element{
 const [review,setReview]=useState<ChangeReview|null>(null),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[file,setFile]=useState(0),[offset,setOffset]=useState(0),[confirm,setConfirm]=useState<'apply'|'reject'|null>(null),[deciding,setDeciding]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let current=true;setLoading(true);setNotice('');setReview(null);setConfirm(null);setFile(0);setOffset(0);
  props.load().then(value=>{if(current){setReview(value);if(value?.blocked)setNotice(value.blocked);}}).catch(error=>{if(current)setNotice(error instanceof Error?error.message:'Changes unavailable.');}).finally(()=>{if(current)setLoading(false);});return ()=>{current=false;};
 },[refresh]);
 const selected=review?.files[file],lines=selected?.lines.flatMap(line=>wrapCells(line,Math.max(1,props.width-2)))??[];
 const count=Math.max(1,props.rows-6),max=Math.max(0,lines.length-count);
 useEffect(()=>setOffset(value=>Math.min(value,max)),[max]);
 useInput((input,key)=>{
  if(loading||deciding)return;
  if(input==='f'){setRefresh(value=>value+1);return;}
  if(confirm){if(key.return&&review&&!props.busy){const decision=confirm;setConfirm(null);setDeciding(true);props.decide(review.token,review.digest,decision).then(result=>{setNotice(result.kind==='applied'?`${result.files} files applied · completion not verified`:result.kind==='rejected'?'Set aside · files preserved in workspace':result.reason??'Application uncertain. Inspect receipts.');setReview(null);}).catch(error=>setNotice(error instanceof Error?error.message:'Decision refused. Refresh changes.')).finally(()=>setDeciding(false));}return;}
  if(input==='n'||input==='p'){setFile(value=>Math.max(0,Math.min((review?.files.length??1)-1,value+(input==='n'?1:-1))));setOffset(0);return;}
  if(key.downArrow||key.pageDown)setOffset(value=>Math.min(max,value+(key.pageDown?count:1)));
  if(key.upArrow||key.pageUp)setOffset(value=>Math.max(0,value-(key.pageUp?count:1)));
  if(review&&!props.busy&&(input==='r'&&(review.files.length||review.blocked)||input==='a'&&review.files.length&&!review.blocked))setConfirm(input==='a'?'apply':'reject');
 });
 return <Box width={props.width} flexDirection="column">
  <ViewTitle title="Changes" detail={review?`${review.files.length?file+1:0} / ${review.files.length} files · unverified`:loading?'reading actual delta':''}/>
  <Text color={inkColor(theme.dim)} wrap="truncate-end">{confirm?(confirm==='apply'?`Apply all ${review?.files.length} reviewed files to the source? Enter confirm`:'Set these changes aside? Files stay recoverable. Enter confirm'):selected?`${selected.kind} · ${selected.path}`:loading?'Preparing review…':notice||'No isolated changes to review.'}</Text>
  <Box flexDirection="column" height={count} overflow="hidden">
   {lines.slice(offset,offset+count).map((line,i)=><Text key={offset+i} wrap="truncate-end" color={inkColor(line.startsWith('+')?theme.confirmed:line.startsWith('-')?theme.failed:theme.text)}>{line}</Text>)}
  </Box>
  <Text color={inkColor(theme.faint)} wrap="truncate-end">{selected||confirm?notice:''}</Text>
  <Text color={inkColor(theme.faint)} wrap="truncate-end">{deciding?'Applying reviewed decision…':props.busy?'Work running · inspection available · /stop before deciding':confirm?'Enter confirm · Esc close':review?.blocked?'r set aside · f refresh · Esc close':review?.files.length?'n/p file · ↑↓ / Pg↑ Pg↓ scroll · a apply · r set aside · f refresh · Esc close':'f refresh · Esc close'}</Text>
 </Box>;
}

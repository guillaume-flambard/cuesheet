import React from "react";
import {Box,Text} from "ink";
import type {Entry} from "../app/state.ts";
import {characters,cellWidth} from "./editor.ts";
import {theme,inkColor} from "../theme/tokens.ts";

/** Bound by terminal cells, without splitting combined characters. */
export function wrapCells(text:string,width:number):string[]{
 const lines:string[]=[];let line="",cells=0;
 for(const c of characters(text)){if(c==="\n"){lines.push(line);line="";cells=0;continue;}const size=cellWidth(c);if(cells+size>Math.max(1,width)&&line){const at=line.lastIndexOf(" ");if(at>0){lines.push(line.slice(0,at));line=line.slice(at+1);cells=cellWidth(line);}else{lines.push(line);line="";cells=0;}}line+=c;cells+=size;}
 lines.push(line);return lines;
}
export function liveWorkRows(entries:readonly Entry[],reasoning:string,width:number,budget:number,context:readonly string[]=[],originalIntent?:string){
 const last=entries.findLastIndex(e=>e.kind==="you");const intent=entries[last];
 const allIntent=wrapCells((originalIntent??(intent?.kind==="you"?intent.text:"Current intention")).replace(/\s+/g," "),width-2);
 const intentLines=allIntent.slice(0,2);if(allIntent.length>2)intentLines[1]=characters(intentLines[1]!).slice(0,-1).join("")+"…";
 const signals=context.filter(line=>/^(↳ direction|success) ·/.test(line)).slice(0,budget>=12?2:1);
 const slots=Math.max(1,budget-intentLines.length-signals.length-(reasoning?5:2));
 const availableWorkers=context.filter(line=>/^\s*[├└]─/.test(line));
 const availableActions=entries.slice(last+1).filter((e):e is Extract<Entry,{kind:"action"}>=>e.kind==="action");
 const workers=availableWorkers.slice(0,Math.min(3,Math.max(0,slots-(availableActions.length?1:0))));
 const actions=availableActions.slice(-Math.min(3,Math.max(1,slots-workers.length)));
 const branches=Math.max(1,actions.length+workers.length);
 const room=Math.max(1,budget-intentLines.length-signals.length-Math.max(1,actions.length+workers.length)-4);
 return {intentLines,signals,actions,workers,tail:reasoning?wrapCells(reasoning,width-4).slice(-room):[],height:intentLines.length+signals.length+branches+2+(reasoning?room+2:0)};
}
export function LiveWork({entries,reasoning,kind,width,budget,context=[],intent}:{entries:readonly Entry[];reasoning:string;kind?:"reasoning"|"text";width:number;budget:number;context?:readonly string[];intent?:string}):JSX.Element{
 const {intentLines,signals,actions,workers,tail}=liveWorkRows(entries,reasoning,width,budget,context,intent);
 return <Box flexDirection="column" flexShrink={0}>
  {intentLines.map((line,i)=><Text key={i} bold color={inkColor(theme.text)}>{i?"  ":"› "}{line}</Text>)}
  {signals.map((line,i)=><Text key={`signal-${i}`} wrap="truncate-end" color={inkColor(theme.dim)}>{line}</Text>)}
  <Text> </Text>
  <Text color={inkColor(theme.dim)}>  work · Tab inspect</Text>
  {workers.map((line,i)=><Text key={`worker-${i}`} wrap="truncate-end" color={inkColor(theme.dim)}>{line}</Text>)}
  {actions.length?actions.map((action,i)=><Text key={action.id} wrap="truncate-end" color={inkColor(action.certainty==="failed"?theme.failed:action.certainty==="active"?theme.active:theme.dim)}>  {i===actions.length-1?"└─":"├─"} {action.certainty==="active"?"●":action.certainty==="confirmed"?"✓":action.certainty==="failed"?"×":"?"} {action.label}{action.detail?" · "+action.detail:""}</Text>):workers.length?null:<Text color={inkColor(theme.dim)}>  └─ ● {reasoning?"Receiving response":"Waiting for model"}</Text>}
  {reasoning&&<>
   <Text> </Text>
   <Text color={inkColor(theme.active)}>  {kind==="text"?"Response":"Reasoning"} <Text color={inkColor(theme.faint)}>  Tab inspect</Text></Text>
   <Box height={Math.max(1,budget-intentLines.length-signals.length-Math.max(1,actions.length+workers.length)-4)} flexDirection="column" flexShrink={0}>{tail.map((line,i)=><Text key={i} wrap="truncate-end" color={inkColor(kind==="text"?theme.text:theme.dim)}>  │ {line||" "}</Text>)}</Box>
  </>}
 </Box>;
}

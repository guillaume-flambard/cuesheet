import React, { useState, useRef, useEffect } from "react";
import { Box, Text, useInput, measureElement, type DOMElement } from "ink";
import { theme, inkColor } from "../theme/tokens.ts";

import {SelectionRow,ViewTitle} from "../components/Surface.tsx";
import {wrapCells} from "../components/LiveWork.tsx";
import {commandCatalog} from "../app/commands.ts";
import type {CheckConfirmation,SharedContextPage} from "../producer/index.ts";

const commands = [
  { label: "View the log", overlay: "inspect" },
  { label: "Help", overlay: "help" },
  { label: "Provider and model", overlay: "models" },
  { label: "Sessions", overlay: "sessions" },
  { label: "New session", overlay: "new" },
  { label: "Resume work", overlay: "resume" },
  { label: "Acceptance check", overlay: "check" },
  { label: "Shared context", overlay: "context" },
  { label: "Skills", overlay: "skills" },
  { label: "Agents", overlay: "agents" },
  { label: "Agent models", overlay: "agent-models" },
  { label: "Situation", overlay: "situation" },
  { label: "Notifications", overlay: "notifications" },
  { label: "Review changes", overlay: "changes" },
  { label: "Workspaces", overlay: "workspaces" },
  { label: "Stop work", overlay: "stop" },
  { label: "Animations on/off", overlay: "motion" },
  { label: "Correct direction", overlay: "steer" },
  { label: "Session memory", overlay: "native" },
  { label: "Quit", overlay: "quit" },
  { label: "Inspect work", overlay: "work" },
] as const;

export function Palette(props: { initialAction?:string; onAction?(action:string):void; rows?: number; width?:number; onOpen(overlay: "inspect" | "help" | "models" | "sessions" | "changes" | "work"): void; onNew?():void; onResume?():void; onCheck?():CheckConfirmation|null; onConfirmCheck?(approval:CheckConfirmation):void; onSkills?():SharedContextPage; onWorkspaces?():SharedContextPage; onNotifications?():SharedContextPage; onReadNotifications?(digest:string):SharedContextPage; onSituation?():SharedContextPage; onAgentModels?():void; onAgents?(offset?:number):SharedContextPage; onContext?(offset?:number,expectedDigest?:string):SharedContextPage }): JSX.Element {
  const [at, setAt] = useState(0);
  const [query,setQuery]=useState("");
  const items=commands.filter(c=>`${c.label} ${commandCatalog.find(x=>x.action===c.overlay)?.name??""}`.toLowerCase().includes(query.replace(/^\//,'').toLowerCase()));
  const [approval,setApproval]=useState<CheckConfirmation|null>(null);
  const [contextPage,setContextPage]=useState<SharedContextPage|null>(null);
  const [skillsMode,setSkillsMode]=useState(false);
  const [workspacesMode,setWorkspacesMode]=useState(false);
  const [notificationsMode,setNotificationsMode]=useState(false);
  const [situationMode,setSituationMode]=useState(false);
  const [agentsMode,setAgentsMode]=useState(false);
  useEffect(()=>{if(!agentsMode&&!situationMode&&!notificationsMode&&!workspacesMode&&!skillsMode)return;const timer=setInterval(()=>setContextPage(p=>{if(skillsMode){const next=props.onSkills?.();return !next||next.digest===p?.digest?p:next;}if(workspacesMode){const next=props.onWorkspaces?.();return !next||next.digest===p?.digest?p:next;}return notificationsMode?props.onNotifications?.()??p:situationMode?props.onSituation?.()??p:props.onAgents?.(p?.offset??0)??p;}),situationMode?1000:500);return ()=>clearInterval(timer);},[skillsMode,agentsMode,situationMode,notificationsMode,workspacesMode,props.onSkills,props.onAgents,props.onSituation,props.onNotifications,props.onWorkspaces]);
  const [notice,setNotice]=useState("");
  const [offset,setOffset]=useState(0);const [height,setHeight]=useState(0);const content=useRef<DOMElement>(null);
  const viewport=Math.max(1,(props.rows ?? 10)-4);
  const contextLines=contextPage?.lines.flatMap(line=>wrapCells(line.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,""),Math.max(1,props.width??60)).map(text=>({text,source:line})))??[];
  const scrollHeight=contextPage?contextLines.length:height;
  useEffect(()=>{if(contextPage){setOffset(i=>Math.min(i,Math.max(0,contextLines.length-viewport)));return;}if(content.current){const measured=measureElement(content.current).height;setHeight(measured);setOffset(i=>Math.min(i,Math.max(0,measured-viewport)));}},[approval,contextPage,props.rows,props.width]);
  const activate=(selected:string)=>{
      if(["stop","motion","steer","native","quit"].includes(selected))props.onAction?.(selected);
      else if(selected==="new") props.onNew?.();
      else if(selected==="resume") props.onResume?.();
      else if(selected==="check") {const snapshot=props.onCheck?.() ?? null;setApproval(snapshot);setOffset(0);setNotice(snapshot ? "" : "No pinned check to renew for the current objective.");}
      else if(selected==="skills") {setSkillsMode(true);setContextPage(props.onSkills?.()??{digest:"",offset:0,nextOffset:null,lines:["Skills unavailable."]});setOffset(0);}
      else if(selected==="workspaces") {setWorkspacesMode(true);setContextPage(props.onWorkspaces?.()??{digest:"",offset:0,nextOffset:null,lines:["Workspaces unavailable."]});setOffset(0);}
      else if(selected==="notifications") {setNotificationsMode(true);setContextPage(props.onNotifications?.()??{digest:"",offset:0,nextOffset:null,lines:["Notifications unavailable."]});setOffset(0);}
      else if(selected==="situation") {setSituationMode(true);setContextPage(props.onSituation?.()??{digest:"",offset:0,nextOffset:null,lines:["Situation unavailable."]});setOffset(0);}
      else if(selected==="agent-models")props.onAgentModels?.();
      else if(selected==="agents") {setAgentsMode(true);setContextPage(props.onAgents?.() ?? {digest:"",offset:0,nextOffset:null,lines:["No agents available."]});setOffset(0);}
      else if(selected==="context") {setContextPage(props.onContext?.() ?? {digest:"",offset:0,nextOffset:null,lines:["No shared context configured."]});setOffset(0);}
      else props.onOpen(selected as "inspect"|"help"|"models"|"sessions"|"changes"|"work");
  };
  useEffect(()=>{if(props.initialAction)activate(props.initialAction);},[]);
  useInput((input, key) => {
    if(contextPage){
      if(key.downArrow || key.pageDown)setOffset(i=>Math.min(Math.max(0,scrollHeight-viewport),i+(key.pageDown?viewport:1)));
      if(key.upArrow || key.pageUp)setOffset(i=>Math.max(0,i-(key.pageUp?viewport:1)));
      if(notificationsMode&&input.toLowerCase()==="m"){setContextPage(props.onReadNotifications?.(contextPage.digest)??contextPage);return;}
      const page=input.toLowerCase();
      if((page==="n" && contextPage.nextOffset!==null) || (page==="p" && contextPage.offset>0)){
        setContextPage((agentsMode ? props.onAgents : props.onContext)?.(page==="n" ? contextPage.nextOffset! : Math.max(0,contextPage.offset-20),contextPage.digest) ?? null);setOffset(0);
      }
      return;
    }
    if(approval){
      if(key.downArrow || key.pageDown)setOffset(i=>Math.min(Math.max(0,scrollHeight-viewport),i+(key.pageDown?viewport:1)));
      if(key.upArrow || key.pageUp)setOffset(i=>Math.max(0,i-(key.pageUp?viewport:1)));
      if(input.toLowerCase()==="c")props.onConfirmCheck?.(approval);
      return;
    }
    if(key.ctrl||key.meta)return;
    if(key.backspace||key.delete){setQuery(q=>Array.from(q).slice(0,-1).join(''));setAt(0);return;}
    if(input&&!key.return&&!key.upArrow&&!key.downArrow&&!key.escape){setQuery(q=>q+input.replace(/[\x00-\x1f\x7f]/g,''));setAt(0);return;}
    if (key.downArrow) setAt((i) => Math.min(i + 1, Math.max(0,items.length - 1)));
    if (key.upArrow) setAt((i) => Math.max(i - 1, 0));
    if (key.return) {
      const selected=items[at]?.overlay;if(selected)activate(selected);
    }
  });
  if(contextPage)return <Box width={props.width} height={props.rows} flexShrink={0} flexDirection="column">
    <ViewTitle title={skillsMode?"Skills":workspacesMode?"Workspaces":notificationsMode?"Notifications":situationMode?"Situation":agentsMode ? "Agents" : "Shared context"}/>
    <Box height={viewport} overflow="hidden" flexDirection="column" flexShrink={0}>
      {contextLines.slice(offset,offset+viewport).map(({text,source},i)=><Box key={offset+i} height={1} flexShrink={0}><Text wrap="truncate-end" color={workspacesMode?inkColor(source.startsWith("× ")?theme.failed:source.startsWith("◇ ")?theme.active:source.startsWith("✓ ")?theme.confirmed:source.startsWith("? ")?theme.unknown:source.startsWith("Base Git")?theme.dim:theme.text):undefined}>{text||" "}</Text></Box>)}
    </Box>
    <Text wrap="truncate-end" color={inkColor(theme.faint)}>{skillsMode?"↑↓ scroll · Esc close":workspacesMode?"↑↓ scroll · Esc close":notificationsMode?"↑↓ scroll · M mark read · Esc close":situationMode?"↑↓ scroll · Esc close":"↑↓ scroll · N/P pages · Esc close"}</Text>
  </Box>;
  if(approval)return <Box width={props.width} flexDirection="column">
    <ViewTitle title="Confirm the pinned check"/>
    <Box height={viewport} overflow="hidden" flexDirection="column" flexShrink={0}>
      <Box ref={content} flexDirection="column" flexShrink={0} marginTop={-offset}>
        <Text>Project: {approval.scope}</Text>
        <Text>Request: {approval.text}</Text>
        {approval.corrections.map((text,i)=><Text key={i}>Correction : {text}</Text>)}
        <Text>ID : {approval.id} · revision {approval.revision}</Text>
        <Text>Pinned check: {approval.digest}</Text>
        <Text>Confirming authorizes this check for the current objective. It does not verify the result or resume work.</Text>
        {approval.criteria.length>0 && <Text>Model-proposed criteria, without independent authority: {approval.criteria.join(" ; ")}</Text>}
      </Box>
    </Box>
    <Text wrap="truncate-end" color={inkColor(theme.faint)}>↑↓ scroll · C confirm · Esc cancel</Text>
  </Box>;
  const visible=Math.max(1,Math.min(8,(props.rows ?? 10)-4));
  const start=Math.max(0,at-visible+1);
  const rowWidth=Math.max(1,Math.min(props.width??60,72));
  return <Box flexDirection="column" width={rowWidth}>
    <Box justifyContent="space-between"><Text bold color={inkColor(theme.text)}>Commands</Text><Text color={inkColor(theme.faint)}>{items.length ? `${at+1} / ${items.length}` : "0 matches"}</Text></Box>
    <Text wrap="truncate-end" color={inkColor(query?theme.text:theme.faint)}>{notice || (query?`› ${query}`:"› Type to find a command")}</Text>
    <Text> </Text>
    {items.slice(start,start+visible).map((command, offset) => {
      const selected=start+offset===at;
      const slash=`/${commandCatalog.find(c=>c.action===command.overlay)?.name??command.overlay}`;
      return <SelectionRow key={command.overlay} width={rowWidth} selected={selected} label={command.label} detail={slash}/>;
    })}
    <Text wrap="truncate-end" color={inkColor(theme.faint)}>↑↓ choose · Enter open · Esc close</Text>
  </Box>;
}

import React, { useState, useRef, useEffect } from "react";
import { Box, Text, useInput, measureElement, type DOMElement } from "ink";
import { theme, inkColor } from "../theme/tokens.ts";

import type {CheckConfirmation} from "../producer/index.ts";

const commands = [
  { label: "View the log", overlay: "inspect" },
  { label: "Help", overlay: "help" },
  { label: "Provider et modèle", overlay: "models" },
  { label: "Sessions", overlay: "sessions" },
  { label: "Nouvelle session", overlay: "new" },
  { label: "Reprendre le travail", overlay: "resume" },
  { label: "Critère de validation", overlay: "check" },
] as const;

export function Palette(props: { rows?: number; width?:number; onOpen(overlay: "inspect" | "help" | "models" | "sessions"): void; onNew?():void; onResume?():void; onCheck?():CheckConfirmation|null; onConfirmCheck?(approval:CheckConfirmation):void }): JSX.Element {
  const [at, setAt] = useState(0);
  const [approval,setApproval]=useState<CheckConfirmation|null>(null);
  const [notice,setNotice]=useState("");
  const [offset,setOffset]=useState(0);const [height,setHeight]=useState(0);const content=useRef<DOMElement>(null);
  const viewport=Math.max(1,(props.rows ?? 10)-3);
  useEffect(()=>{if(content.current)setHeight(measureElement(content.current).height);},[approval,props.rows,props.width]);
  useInput((input, key) => {
    if(approval){
      if(key.downArrow || key.pageDown)setOffset(i=>Math.min(Math.max(0,height-viewport),i+(key.pageDown?viewport:1)));
      if(key.upArrow || key.pageUp)setOffset(i=>Math.max(0,i-(key.pageUp?viewport:1)));
      if(input.toLowerCase()==="c")props.onConfirmCheck?.(approval);
      return;
    }
    if (key.downArrow) setAt((i) => Math.min(i + 1, commands.length - 1));
    if (key.upArrow) setAt((i) => Math.max(i - 1, 0));
    if (key.return) {
      const selected=commands[at]!.overlay;
      if(selected==="new") props.onNew?.();
      else if(selected==="resume") props.onResume?.();
      else if(selected==="check") {const snapshot=props.onCheck?.() ?? null;setApproval(snapshot);setOffset(0);setNotice(snapshot ? "" : "Aucun check épinglé à renouveler pour le contrat courant.");}
      else props.onOpen(selected);
    }
  });
  if(approval)return <Box width={props.width} flexDirection="column">
    <Text color={inkColor(theme.brand)}>Confirmer le critère épinglé</Text>
    <Box height={viewport} overflow="hidden" flexDirection="column" flexShrink={0}>
      <Box ref={content} flexDirection="column" flexShrink={0} marginTop={-offset}>
        <Text>Projet : {approval.scope}</Text>
        <Text>Demande : {approval.text}</Text>
        {approval.corrections.map((text,i)=><Text key={i}>Correction : {text}</Text>)}
        <Text>ID : {approval.id} · révision {approval.revision}</Text>
        <Text>Check épinglé : {approval.digest}</Text>
        <Text>Confirmer autorise ce check à vérifier ce contrat. Cela ne valide pas le résultat et ne relance pas le travail.</Text>
        {approval.criteria.length>0 && <Text>Critères proposés par le modèle, sans autorité indépendante : {approval.criteria.join(" ; ")}</Text>}
      </Box>
    </Box>
    <Text wrap="truncate-end" color={inkColor(theme.faint)}>↑↓ lire · C confirmer · Esc annuler</Text>
  </Box>;
  const visible=Math.max(1,(props.rows ?? 10)-2);
  const start=Math.max(0,at-visible+1);
  return <Box flexDirection="column">
    <Text wrap="truncate-end" color={inkColor(theme.dim)}>{notice || "Commands"}</Text>
    {commands.slice(start,start+visible).map((command, offset) => <Text key={command.overlay} color={inkColor(start + offset === at ? theme.brand : theme.dim)}>
      {start + offset === at ? "> " : "  "}{command.label}
    </Text>)}
    <Text color={inkColor(theme.faint)}>↑↓ to move · enter to open · esc to close</Text>
  </Box>;
}

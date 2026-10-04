import React,{useState} from 'react';import {Box,Text,useInput} from 'ink';
import {ViewTitle} from '../components/Surface.tsx';
import {commandCatalog} from '../app/commands.ts';import {theme,inkColor} from '../theme/tokens.ts';
export function Help({rows=14,onClose}:{rows?:number;onClose():void}):JSX.Element{
 const [offset,setOffset]=useState(0);const lines=[...commandCatalog.map(c=>`/${c.name}  ${c.description}`),'','Tab / Ctrl+L work · Ctrl+P models · Ctrl+K commands','↑/↓ input history · Pg↑/↓ or scroll conversation','Ctrl+O newline · Ctrl+A/E start/end · Ctrl+U clear',process.platform==='darwin'?'Mac: Option+←/→ words · Option+Delete previous word':'Meta+B/F words · Meta+Backspace previous word','Ctrl+W previous word · Ctrl+C stop, then quit','Option behavior depends on terminal key mappings.'];const visible=Math.max(1,rows-3);
 useInput((_input,key)=>{if(key.escape||key.return)onClose();if(key.downArrow||key.pageDown)setOffset(x=>Math.min(Math.max(0,lines.length-visible),x+(key.pageDown?visible:1)));if(key.upArrow||key.pageUp)setOffset(x=>Math.max(0,x-(key.pageUp?visible:1)));});
 return <Box flexDirection="column" height={rows} overflow="hidden"><ViewTitle title="Commands and keyboard" detail={`${offset+1} / ${lines.length}`}/>{lines.slice(offset,offset+visible).map((line,i)=><Text key={offset+i} wrap="truncate-end" color={inkColor(theme.dim)}>{line||' '}</Text>)}<Text color={inkColor(theme.faint)}>↑↓ / Pg↑↓ scroll · Esc close</Text></Box>;
}

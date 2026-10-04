import React from 'react';
import {Box,Text} from 'ink';
import {theme,inkColor} from '../theme/tokens.ts';

/** Shared keyboard focus, restricted to temporary inspection views. */
export function SelectionRow({label,detail='',selected,width=64}:{label:string;detail?:string;selected:boolean;width?:number}):JSX.Element {
 const columns=Math.max(1,width),right=detail&&columns>=48?Math.min(24,Math.floor(columns/3)):0;
 return <Box width={columns} flexShrink={0}>
  <Text backgroundColor={selected?inkColor(theme.focus):undefined} color={inkColor(selected?theme.brand:theme.faint)} bold>{selected?'› ':'  '}</Text>
  <Box width={Math.max(1,columns-2-right)}><Text backgroundColor={selected?inkColor(theme.focus):undefined} color={inkColor(selected?theme.text:theme.dim)} bold={selected} wrap="truncate-end">{(label+(right?'':detail?'  '+detail:'')).padEnd(Math.max(1,columns-2-right))}</Text></Box>
  {right>0&&<Box width={right}><Text backgroundColor={selected?inkColor(theme.focus):undefined} color={inkColor(selected?theme.brand:theme.faint)} wrap="truncate-start">{detail.padStart(right)}</Text></Box>}
 </Box>;
}
export function ViewTitle({title,detail,compact=false}:{title:string;detail?:string;compact?:boolean}):JSX.Element {
 return <Box marginBottom={compact?0:1} flexShrink={0} justifyContent="space-between"><Text bold color={inkColor(theme.text)}>{title}</Text>{detail&&<Text color={inkColor(theme.faint)} wrap="truncate-start">{detail}</Text>}</Box>;
}

import React from "react";
import {Box,Text} from "ink";
import {theme,inkColor} from "../theme/tokens.ts";

export type AnswerLine={kind:"text"|"heading"|"code"|"list"|"space";text:string;prefix?:string};
/** Presentation only: stored text and event identity stay verbatim. */
export function answerLines(text:string):AnswerLine[]{
  let code=false;const result:AnswerLine[]=[];
  for(const line of text.split("\n")){
    if(/^\s*```/.test(line)){code=!code;if(result.at(-1)?.kind!=="space")result.push({kind:"space",text:""});continue;}
    if(code){result.push({kind:"code",text:line});continue;}
    if(!line.trim()){if(result.at(-1)?.kind!=="space")result.push({kind:"space",text:""});continue;}
    const heading=line.match(/^#{1,6}\s+(.+)/);if(heading){result.push({kind:"heading",text:heading[1]!});continue;}
    const list=line.match(/^(\s*)([-*+] |\d+[.)] )(.*)/);if(list){result.push({kind:"list",text:list[3]!,prefix:list[1]+(/^[0-9]/.test(list[2]!)?list[2]!:'• ')});continue;}
    result.push({kind:"text",text:line});
  }
  while(result[0]?.kind==="space")result.shift();while(result.at(-1)?.kind==="space")result.pop();return result;
}
function Inline({text}:{text:string}):JSX.Element {
 const parts=text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
 return <Text>{parts.map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<Text key={i} bold>{part.slice(2,-2)}</Text>:part.startsWith('`')&&part.endsWith('`')?<Text key={i} color={inkColor(theme.dim)}>{part.slice(1,-1)}</Text>:<Text key={i}>{part}</Text>)}</Text>;
}
export function Answer({text,width}:{text:string;width:number}):JSX.Element {
 return <Box flexDirection="column" width={width} flexShrink={0}>{answerLines(text).map((line,i)=>
  line.kind==='space'?<Text key={i}> </Text>:line.kind==='heading'?<Text key={i} bold color={inkColor(theme.text)}><Inline text={line.text}/></Text>:line.kind==='code'?<Box key={i} flexShrink={0}><Text color={inkColor(theme.rule)}>│ </Text><Text backgroundColor={inkColor(theme.code)} color={inkColor(theme.dim)}>{line.text||' '}</Text></Box>:line.kind==='list'?<Box key={i} flexShrink={0}><Text color={inkColor(theme.dim)}>{line.prefix}</Text><Box flexGrow={1} flexShrink={1}><Text color={inkColor(theme.text)}><Inline text={line.text}/></Text></Box></Box>:<Text key={i} color={inkColor(theme.text)}><Inline text={line.text}/></Text>
 )}</Box>;
}

import React from "react";
import {Box,Text} from "ink";
import {useMotionPulse} from "../theme/motion.tsx";
import {theme,inkColor,blend} from "../theme/tokens.ts";

/** Identity and the actual compute choice; project scope belongs to the work. */
export function Header({width,model}:{width:number;project:string|null;busy:boolean;model:string}):JSX.Element {
  const pulse=useMotionPulse(model);
  const label=model.replace(/^opencode-binary\s*·\s*/,"").replace(/^opencode-go\//,"");
  return <Box width={width} justifyContent="space-between" flexShrink={0}>
    <Text color={inkColor(theme.brand)} bold>◈ cuesheet</Text>
    <Text color={inkColor(blend(theme.active,theme.faint,pulse))} wrap="truncate-start">{label}</Text>
  </Box>;
}

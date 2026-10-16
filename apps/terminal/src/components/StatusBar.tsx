import React from "react";
import {Box,Text} from "ink";
import {theme,inkColor} from "../theme/tokens.ts";
import type {Entry} from "../app/state.ts";
import {statusHints} from "./status-hints.ts";

/** A single, stable keyboard guide. Notifications remain actionable in the menu. */
export function StatusBar({width,notifications,busy,overlay="none",targeted=false}:{overlay?:string;targeted?:boolean;width:number;notifications?:number;entries:readonly Entry[];busy:boolean;onHelp():void}):JSX.Element {
  const hints=statusHints({overlay,targeted,busy,width});
  return <Box width={width} justifyContent="space-between" flexShrink={0}>
    <Text color={inkColor(theme.faint)} wrap="truncate-end">{hints}</Text>
    {notifications ? <Text color={inkColor(theme.active)}>{notifications} new</Text> : null}
  </Box>;
}

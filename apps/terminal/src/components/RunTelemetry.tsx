import React from "react";
import {Box, Text} from "ink";
import type {LiveTelemetry} from "../app/state.ts";
import {inkColor,theme,glyph} from "../theme/tokens.ts";

/** Reported numbers only: no estimated tokens, invented costs or chain-of-thought. */
import {telemetryText} from "./telemetry-text.ts";

export function RunTelemetry({value,width,busy,compact=false}:{value:LiveTelemetry;width:number;busy:boolean;compact?:boolean}):JSX.Element|null {
  if(!value.requests)return null;
  const phase=busy
    ?value.phase==="raisonnement"?"Réflexion signalée":value.phase==="réponse"?"Réponse en cours":"Modèle sollicité"
    :"Dernière activité du modèle";
  if(compact)return <Box width={width} flexShrink={0}>
    <Text color={inkColor(busy?theme.active:theme.dim)} wrap="truncate-end">{value.steps?telemetryText(value):"jetons — · coût —"} · {phase}</Text>
  </Box>;
  return <Box flexDirection="column" width={width} flexShrink={0}>
    <Text color={inkColor(busy?theme.active:theme.dim)} wrap="truncate-end">
      {busy?glyph.active:"·"} {phase}
    </Text>
    <Text color={inkColor(theme.dim)} wrap="truncate-end">{telemetryText(value)}</Text>
  </Box>;
}

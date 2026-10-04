/**
 * The conversation, and the only part that grows.
 *
 * Actions are objects rather than paragraphs, because a log line is a fact about
 * the harness and an object is a fact about the work. "✓ Read  router.ts" is
 * short enough to scan without reading, which a paragraph of the same information
 * is not.
 *
 * The status block is what this surface can do that a log cannot: it shows that
 * the work exists, that the artifact was recovered, and that the completion of the
 * producer is unknown. Three different certainties, side by side, in words a
 * person can act on.
 *
 * Every line is keyed by the identity it carries rather than by where it sits.
 * That was the second half of one reply rendering three times: the surface could
 * not tell one line from another, and the renderer agreed with it.
 */
import React, { useLayoutEffect, useRef, useState } from "react";
import { Box, Text, useInput, measureElement, type DOMElement } from "ink";
import { theme, glyph, inkColor } from "../theme/tokens.ts";
import {WorkContext} from "./WorkContext.tsx";
import {LiveWork,liveWorkRows} from "./LiveWork.tsx";
import {Answer} from "./Answer.tsx";
import type { Entry, Certainty } from "../app/state.ts";

const colorFor = (c: Certainty): string =>
  inkColor(c === "confirmed" ? theme.confirmed : c === "active" ? theme.active : c === "failed" ? theme.failed : theme.unknown);
const markFor = (c: Certainty): string =>
  c === "confirmed" ? glyph.confirmed : c === "active" ? glyph.active : c === "failed" ? glyph.failed : glyph.unknown;

export function Timeline({ width, entries, visible, rows, context=[],reasoning="",progressKind="reasoning",busy=false,active=true,intent }: { intent?:string;active?:boolean;busy?:boolean;width: number; entries: readonly Entry[]; visible: number; rows?: number; reasoning?:string;progressKind?:"reasoning"|"text";context?:readonly string[] }): JSX.Element {
  const lastHuman = entries.findLastIndex(entry=>entry.kind==="you");
  const content = useRef<DOMElement>(null);
  const [height, setHeight] = useState(0);
  const [offset, setOffset] = useState(0);
  const total = Math.max(1,(rows??visible)-1);
  const liveBudget=Math.max(4,Math.min(14,total-4));
  const liveHeight=busy?liveWorkRows(entries,reasoning,width,liveBudget,context,intent).height:0;
  const viewport = Math.max(1,total-liveHeight);
  const maximum = Math.max(0, height - viewport);
  useLayoutEffect(() => {
    if (!active || !content.current) return;
    const next = measureElement(content.current).height;
    setOffset((old) => old ? Math.min(Math.max(0, next - viewport), Math.max(0, old + next - height)) : 0);
    setHeight(next);
  }, [entries, width, viewport, busy, active, context.join("\n")]);
  useInput((_input, key) => {
    if(!active)return;
    if (key.pageUp) setOffset((old) => Math.min(maximum, old + Math.max(1, viewport - 1)));
    if (key.pageDown) setOffset((old) => Math.max(0, old - Math.max(1, viewport - 1)));
  });
  return (
    <Box width={width} height={rows} flexDirection="column" flexShrink={0}>
      {busy&&<LiveWork intent={intent} context={context} entries={entries} reasoning={reasoning} kind={progressKind} width={width} budget={liveBudget}/>}
      <Box height={viewport} overflow="hidden" flexDirection="column" justifyContent={"flex-start"} flexShrink={0}>
        <Box ref={content} flexDirection="column" flexShrink={0} marginTop={-Math.max(0, maximum - Math.min(offset, maximum))}>
          {/* Keyed by the identity the producer carried, not by the position. An
              index key makes the renderer reconcile by where a line happens to
              sit, so a line that arrives above another one is re-rendered as the
              wrong line, and the settled form of a row that arrived twice is drawn
              as if it were the original. The identity is the same one the surface
              deduplicates on, so the two agree by construction. */}
          {entries.length === 0 ? (
            <Box flexDirection="column" height={Math.max(3,Math.floor(viewport*0.7))} justifyContent="center" flexShrink={0}>
              <Text bold color={inkColor(theme.text)}>What do you want to move forward?</Text>
              <Text> </Text>
              <Text color={inkColor(theme.dim)}>{width<60?'Start anywhere. Redirect anytime.':'One intention. Room to change direction.'}</Text>
              {viewport>=12&&<>
                <Text> </Text>
                <Text color={inkColor(theme.faint)}>› Make Cuesheet easier to use.</Text>
                <Text color={inkColor(theme.faint)}>› Explore a project and find the next step.</Text>
              </>}
            </Box>
          ) : entries.map((entry,index) => <React.Fragment key={entry.id}>{!(busy&&index===lastHuman)&&<Line key={entry.id} entry={entry} width={width}/>}{!busy && index===lastHuman && context.length>0 ? <Box marginTop={1} marginBottom={1} flexShrink={0}><WorkContext lines={context}/></Box> : null}</React.Fragment>)}

        </Box>
      </Box>
      {maximum > 0 && <Text wrap="truncate-end" color={inkColor(theme.dim)}>{offset ? "History · Pg↓ to return" : "Pg↑ history · ↑ messages"}</Text>}
    </Box>
  );
}

function Line({ entry, width }: { entry: Entry; width: number }): JSX.Element | null {
  if (!isConversationEntry(entry)) return null;
  switch (entry.kind) {
    case "you":
      return (
        <Box marginTop={1} paddingX={0} flexDirection="column" flexShrink={0}>
          <Box width={Math.max(1,width)} flexShrink={0}><Text color={inkColor(theme.brand)} bold>› </Text><Text color={inkColor(theme.text)} bold>{entry.text}</Text></Box>
        </Box>
      );
    case "cuesheet":
      return (
        <Box marginTop={1} paddingLeft={2} flexDirection="column" flexShrink={0}>
          <Answer text={entry.text} width={Math.max(1,width-2)}/>
        </Box>
      );
    case "action":
      if(entry.certainty==='confirmed' || entry.certainty==='active')return null;
      return (
        <Box flexShrink={0}>
          <Text color={colorFor(entry.certainty)}>{markFor(entry.certainty)} </Text>
          <Text color={inkColor(theme.dim)}>{entry.label.padEnd(10)}</Text>
          <Text color={inkColor(theme.faint)}>{entry.detail ?? ""}</Text>
        </Box>
      );
    case "status":
      if(entry.label.toLowerCase()==='human delta')return <Box marginTop={1} paddingX={0} flexDirection="column" flexShrink={0}><Text bold color={inkColor(theme.text)}>◆ HUMAN DELTA</Text><Text color={inkColor(theme.text)}>{entry.value}</Text><Text color={inkColor(theme.dim)}>{entry.certainty==='confirmed'?'● observed':entry.certainty==='unknown'?'? unknown':'◇ unverified'}</Text></Box>;
      return (
        <Box flexShrink={0}>
          <Text color={inkColor(theme.faint)}>{entry.label} · </Text>
          <Text color={colorFor(entry.certainty)}>{markFor(entry.certainty)} {entry.value}</Text>
        </Box>
      );
    case "failure":
      return (
        <Box flexShrink={0}>
          <Text color={inkColor(theme.failed)}>{glyph.failed} </Text>
          <Text color={inkColor(theme.failed)}>{entry.text}</Text>
        </Box>
      );
  }
}

/** Execution metadata stays in state and inspection, outside the dialogue. */
export const isConversationEntry = (entry:Entry):boolean => !(entry.kind === "status" && (["outils", "working in"].includes(entry.label) || (entry.label === "tour" && entry.value === "Réponse reçue. Le but reste ouvert.")));

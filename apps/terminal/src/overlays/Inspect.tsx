/**
 * `/inspect`: the raw log, which is where the mechanics are allowed to be.
 *
 * Non-negotiable five says `revision`, `pendingEffect`, `ArtifactStanding`,
 * `admission` and their friends exist only under `/inspect` or `/debug`. This is
 * that place, and it is deliberately the ugliest screen in the app.
 *
 * ## Why the lines arrive pre-rendered
 *
 * The producer formats each event into a line and sends it as a string
 * (`{ type: "logged" }`). If this component received raw `Event` objects it would
 * need to import the core's type and read `event.kind` and `event.data`, which is
 * the vocabulary crossing the firewall in the other direction.
 *
 * So the component holds strings. It cannot reach the core, and it is not one
 * import away from reaching it.
 *
 * ## Why the lines are not deduplicated or reordered
 *
 * Because this is the evidence. A log that tidies itself is a log you cannot
 * check a claim against, and the whole reason the surface keeps the raw log
 * rather than deriving everything from it is that a person debugging needs to see
 * the sequence exactly as it was appended.
 */
import React from "react";
import { Box, Text } from "ink";
import { theme, inkColor } from "../theme/tokens.ts";

export function Inspect(props: { lines: readonly string[]; maxLines?: number; width?: number }): JSX.Element {
  if (props.lines.length === 0) {
    return <Text color={inkColor(theme.dim)}>nothing has happened yet</Text>;
  }
  // The tail, because the newest line is the one being looked for, and a log
  // that starts at seq 1 and scrolls away is the same mistake the timeline
  // avoided.
  const shown = props.lines.slice(-Math.max(1, props.maxLines ?? 40));
  return (
    <Box flexDirection="column" width={props.width}>
      <Text color={inkColor(theme.dim)}>the log, as appended</Text>
      {shown.map((line, i) => (
        <Text key={i} color={inkColor(theme.faint)} wrap="truncate-end">
          {line}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text color={inkColor(theme.faint)}>esc to go back</Text>
      </Box>
    </Box>
  );
}
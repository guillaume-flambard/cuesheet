import type {LiveTelemetry} from "../app/state.ts";

export function telemetryText(t:LiveTelemetry):string {
  const counts=t.steps
    ? `in ${t.inputUnknown?"?":t.input.toLocaleString("fr-FR")} · out ${t.outputUnknown?"?":t.output.toLocaleString("fr-FR")} · coût ${t.costUnknown?"?":`$${t.cost.toFixed(4)}`}`
    : "jetons — · coût —";
  return `${counts} · ${t.requests} appel${t.requests>1?"s":""} (depuis ouverture)`;
}

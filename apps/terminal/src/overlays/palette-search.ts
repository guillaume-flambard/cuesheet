/** Discoverable command palette; search changes visibility, never permissions. */
export const paletteCommands = [
  { label: "View the log", overlay: "inspect" },
  { label: "Help", overlay: "help" },
  { label: "Provider et modèle", overlay: "models" },
  { label: "Sessions", overlay: "sessions" },
  { label: "Nouvelle session", overlay: "new" },
  { label: "Reprendre le travail", overlay: "resume" },
  { label: "Critère de validation", overlay: "check" },
  { label: "Contexte partagé", overlay: "context" },
  { label: "Agents", overlay: "agents" },
  { label: "Modèles des agents", overlay: "agent-models" },
  { label: "Situation", overlay: "situation" },
  { label: "Notifications", overlay: "notifications" },
  { label: "Workspaces", overlay: "workspaces" },
  { label: "Revoir les changements", overlay: "review" },
] as const;

type Command = (typeof paletteCommands)[number];
const normalized = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function filterPaletteCommands(input: string): Command[] {
  const parts = normalized(input).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [...paletteCommands];
  return paletteCommands.filter(command => {
    const search = normalized(command.label + " " + command.overlay);
    return parts.every(part => search.includes(part));
  });
}

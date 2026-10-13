/** Discoverable command palette; search changes visibility, never permissions. */
export const paletteCommands = [
  { label: "Voir le journal", overlay: "inspect" },
  { label: "Aide", overlay: "help" },
  { label: "Fournisseur et modèle", overlay: "models" },
  { label: "Sessions", overlay: "sessions" },
  { label: "Nouvelle session", overlay: "new" },
  { label: "Reprendre le travail", overlay: "resume" },
  { label: "Critère de validation", overlay: "check" },
  { label: "Contexte partagé", overlay: "context" },
  { label: "Agents", overlay: "agents" },
  { label: "Modèles des agents", overlay: "agent-models" },
  { label: "Situation", overlay: "situation" },
  { label: "Notifications", overlay: "notifications" },
  { label: "Espaces de travail", overlay: "workspaces" },
  { label: "Revoir les changements", overlay: "review" },
] as const;

type Command = (typeof paletteCommands)[number];
const normalized = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function filterPaletteCommands(input: string): Command[] {
  const parts = normalized(input).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return [...paletteCommands];
  return paletteCommands.filter(command => {
    const aliases: Record<string,string> = { inspect:'view the log journal', help:'help', models:'provider model modèle', workspaces:'workspaces' };
    const search = normalized(command.label + " " + command.overlay + " " + (aliases[command.overlay] ?? ''));
    return parts.every(part => search.includes(part));
  });
}

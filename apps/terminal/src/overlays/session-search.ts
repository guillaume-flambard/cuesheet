import type { SessionChoice } from "./Sessions.tsx";
const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

export function filterSessionChoices(items: readonly SessionChoice[], query: string): SessionChoice[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...items];
  return items.filter(item => {
    const searchable = normalize([item.goal, item.cwd, item.id].join(" "));
    return terms.every(term => searchable.includes(term));
  });
}

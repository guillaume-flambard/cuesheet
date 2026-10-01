/** Catalog reads are metadata requests, never model inferences. */
import { execFile } from 'node:child_process';
import { findBinary } from './default-model.ts';
import { validBaseUrl, type ModelPreferences } from './model-preferences.ts';

export interface CatalogModel { id: string; name: string; }
export async function listModels(choice: ModelPreferences, options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<CatalogModel[]> {
  const env = options.env ?? process.env;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 10000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  signal.throwIfAborted();
  if (choice.provider === 'opencode') {
    const binary = findBinary(env);
    if (!binary) throw new Error('OpenCode introuvable. Saisis un identifiant manuellement.');
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(binary, ['models', '--pure'], { signal, killSignal: 'SIGKILL', timeout: options.timeoutMs ?? 10000, maxBuffer: 2 * 1024 * 1024, env }, (error, output) => {
        if (error) reject(new Error('Catalogue OpenCode indisponible. Saisie manuelle disponible.'));
        else resolve(output);
      });
    });
    return normalize(stdout.split('\n').filter(id => /^[\w.-]+\/[\w./:-]+$/.test(id)).map(id => ({ id, name: id })));
  }
  let baseUrl: string;
  let key: string | undefined;
  if (choice.provider === 'openrouter') { baseUrl = 'https://openrouter.ai/api/v1'; key = env.OPENROUTER_API_KEY; }
  else if (choice.provider === 'openai') {
    baseUrl = 'https://api.openai.com/v1'; key = env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY manque. Saisie manuelle disponible.');
  } else if (choice.provider === 'compatible') {
    if (!choice.baseUrl || !validBaseUrl(choice.baseUrl)) throw new Error('Déclare une URL HTTP(S) valide, incluant /v1.');
    baseUrl = choice.baseUrl; key = env.CUESHEET_API_KEY;
  } else throw new Error('Choisis un provider.');
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: key ? { authorization: `Bearer ${key}` } : {}, signal, redirect: 'error',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    // Provider responses and transport errors may echo credentials. Never expose their bodies.
    throw new Error(`Catalogue indisponible${error instanceof Error && /^HTTP \d+$/.test(error.message) ? ` (${error.message})` : ''}. Saisie manuelle disponible.`);
  }
  signal.throwIfAborted();
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error('Catalogue illisible. Saisie manuelle disponible.'); }
  signal.throwIfAborted();
  if (!data || typeof data !== 'object' || !Array.isArray((data as { data?: unknown }).data)) throw new Error('Catalogue illisible. Saisie manuelle disponible.');
  return normalize((data as { data: unknown[] }).data.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const model = item as Record<string, unknown>;
    if (choice.provider === 'openrouter' && Array.isArray(model.supported_parameters) && !model.supported_parameters.includes('tools')) return [];
    return typeof model.id === 'string' ? [{ id: model.id, name: typeof model.name === 'string' ? model.name : model.id }] : [];
  }));
}

function normalize(models: CatalogModel[]): CatalogModel[] {
  const unique = new Map<string, CatalogModel>();
  for (const model of models) {
    if (!model.id || model.id.length > 256 || /[\s\x00-\x1f\x7f]/.test(model.id)) continue;
    unique.set(model.id, { id: model.id, name: model.name.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 256) });
  }
  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}

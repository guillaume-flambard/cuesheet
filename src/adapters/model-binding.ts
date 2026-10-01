/** Switch the model at the edge without replacing the harness or its event log. */
import type { ContextFrame, ModelAdapter } from '../core/loop.ts';
import { resolveModel, type ResolvedModel } from './default-model.ts';
import { preferencesPath, readModelPreferences, saveModelPreferences, validatePreferences, type ModelPreferences } from './model-preferences.ts';

export interface ModelBinding {
  readonly adapter: ModelAdapter;
  readonly selection: ModelPreferences;
  readonly missing: string | null;
  readonly label: string;
  select(preferences: ModelPreferences, options: { busy: boolean; save: boolean }): { error: string } | { ok: true };
}

export function createModelBinding(options: { project: string; env?: NodeJS.ProcessEnv; path?: string; preferences?: ModelPreferences }): ModelBinding {
  const env = options.env ?? process.env;
  const path = options.path ?? preferencesPath(env);
  let preferences: ModelPreferences = {};
  let loadError: string | null = null;
  try { preferences = options.preferences ?? readModelPreferences(path); }
  catch (error) { loadError = error instanceof Error ? error.message : String(error); }
  let resolved: ResolvedModel | { missing: string } = loadError ? { missing: loadError } : resolveModel({ project: options.project, preferences, env });
  const provider = env.CUESHEET_PROVIDER?.trim() || preferences.provider || 'opencode';
  const sameProvider = provider === preferences.provider;
  const model = env.CUESHEET_MODEL?.trim() || (sameProvider ? preferences.model : undefined);
  const baseUrl = env.CUESHEET_BASE_URL || (sameProvider ? preferences.baseUrl : undefined);
  const ceiling = env.CUESHEET_MAX_TOKENS ?? (sameProvider ? preferences.maxTokens : undefined);
  let selection: ModelPreferences = {
    provider: provider as ModelPreferences['provider'],
    ...(model ? { model } : {}),
    ...(provider === 'compatible' && baseUrl ? { baseUrl } : {}),
    ...(ceiling !== undefined ? { maxTokens: Number(ceiling) } : {}),
  };
  if (!('missing' in resolved)) selection.model = resolved.model ?? undefined;
  const adapter: ModelAdapter = {
    get name() { return 'missing' in resolved ? 'none' : resolved.adapter.name; },
    async infer(frame, signal?: AbortSignal) {
      const current = resolved;
      if ('missing' in current) throw new Error(current.missing);
      return (current.adapter as ModelAdapter & { infer(frame: ContextFrame, signal?: AbortSignal): ReturnType<ModelAdapter['infer']> }).infer(frame, signal);
    },
  };
  return {
    adapter,
    get selection() { return { ...selection }; },
    get missing() { return 'missing' in resolved ? resolved.missing : null; },
    get label() { return 'missing' in resolved ? 'no model' : `${resolved.name}${resolved.model ? ` · ${resolved.model}` : ''}`; },
    select(choice, { busy, save }) {
      if (busy) return { error: 'Un travail est en cours. Interromps-le ou attends sa fin avant de changer de modèle.' };
      let clean: ModelPreferences;
      try { clean = validatePreferences(choice); }
      catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
      if (!clean.provider) return { error: 'Choisis un provider.' };
      if (clean.provider !== 'compatible') delete clean.baseUrl;
      // Explicit UI choices supersede startup selections. Credentials remain available.
      const credentials = { ...env };
      for (const key of ['CUESHEET_PROVIDER', 'CUESHEET_MODEL', 'CUESHEET_BASE_URL', 'CUESHEET_MAX_TOKENS']) delete credentials[key];
      const next = resolveModel({ project: options.project, preferences: {}, env: credentials,
        provider: clean.provider, model: clean.model ?? null, baseUrl: clean.baseUrl, maxTokens: clean.maxTokens });
      if ('missing' in next) return { error: next.missing };
      clean.model = next.model ?? undefined;
      if (save) {
        try { saveModelPreferences(clean, path); }
        catch { return { error: `Impossible de sauvegarder les préférences dans ${path}. Le modèle actif reste inchangé.` }; }
      }
      resolved = next;
      selection = clean;
      return { ok: true };
    },
  };
}

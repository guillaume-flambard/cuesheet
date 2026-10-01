/** Switch the model at the edge without replacing the harness or its event log. */
import type { ContextFrame, ModelAdapter } from '../core/loop.ts';
import { resolveModel, type ResolvedModel } from './default-model.ts';
import { preferencesPath, readModelPreferences, prepareModelPreferences, validatePreferences, type ModelPreferences } from './model-preferences.ts';

export class ModelSelectionChanged extends Error {
  constructor(){super("Model selection changed at an inference boundary.");this.name="ModelSelectionChanged";}
}

export interface ModelBinding {
  readonly adapter: ModelAdapter;
  readonly selection: ModelPreferences;
  readonly missing: string | null;
  readonly label: string;
  select(preferences: ModelPreferences, options: { busy: boolean; save: boolean; beforeCommit?: (selection:ModelPreferences)=>void }): { error: string } | { ok: true; warning?:string };
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
  const inferences=new Set<AbortController>();
  const adapter: ModelAdapter = {
    get name() { return 'missing' in resolved ? 'none' : resolved.adapter.name; },
    async infer(frame, signal?: AbortSignal) {
      const current = resolved;
      if ('missing' in current) throw new Error(current.missing);
      signal?.throwIfAborted();
      const controller=new AbortController();inferences.add(controller);
      const combined=signal ? AbortSignal.any([signal,controller.signal]) : controller.signal;
      let stop=()=>{};
      const aborted=new Promise<never>((_,reject)=>{stop=()=>reject(combined.reason);combined.addEventListener('abort',stop,{once:true});});
      try {
        const work=(current.adapter as ModelAdapter & { infer(frame: ContextFrame, signal?: AbortSignal): ReturnType<ModelAdapter['infer']> }).infer({...frame,model:current.model ?? "unset"},combined);
        const result=await Promise.race([work,aborted]);combined.throwIfAborted();return result;
      } finally {combined.removeEventListener('abort',stop);inferences.delete(controller);}
    },
  };
  return {
    adapter,
    get selection() { return { ...selection }; },
    get missing() { return 'missing' in resolved ? resolved.missing : null; },
    get label() { return 'missing' in resolved ? 'no model' : `${resolved.name}${resolved.model ? ` · ${resolved.model}` : ''}`; },
    select(choice, { save, beforeCommit }) {
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
      let prepared:ReturnType<typeof prepareModelPreferences>|undefined;
      if(save){
        try{prepared=prepareModelPreferences(clean,path);}
        catch{return {error:`Impossible de sauvegarder les préférences dans ${path}. Le modèle actif reste inchangé.`};}
      }
      try {beforeCommit?.({...clean});}
      catch {prepared?.discard();return {error:'Le choix n’a pas pu être enregistré dans la session. Le modèle actif reste inchangé.'};}
      let warning:string|undefined;
      try {prepared?.commit();}
      catch {warning='Modèle appliqué à cette session ; la préférence globale n’a pas pu être sauvegardée.';}
      resolved = next;
      selection = clean;
      for(const inference of inferences)inference.abort(new ModelSelectionChanged());
      return warning ? {ok:true,warning} : {ok:true};
    },
  };
}

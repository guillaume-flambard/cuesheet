/** Non-secret user defaults. Credentials belong only to the environment. */
import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const PROVIDERS = ['opencode', 'openrouter', 'openai', 'compatible'] as const;
export type Provider = typeof PROVIDERS[number];
export interface ModelPreferences {
  provider?: Provider;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
}

export function preferencesPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config'), 'cuesheet', 'models.json');
}

export function validBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function validatePreferences(value: unknown): ModelPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Model preferences must be an object.');
  const source = value as Record<string, unknown>;
  const result: ModelPreferences = {};
  if (source.provider !== undefined) {
    if (!PROVIDERS.includes(source.provider as Provider)) throw new Error('Unknown provider in model preferences.');
    result.provider = source.provider as Provider;
  }
  if (source.model !== undefined) {
    if (typeof source.model !== 'string' || !source.model.trim() || /[\r\n\x00-\x1f]/.test(source.model)) throw new Error('Model must be a non-empty identifier.');
    result.model = source.model.trim();
  }
  if (source.baseUrl !== undefined) {
    if (typeof source.baseUrl !== 'string' || !validBaseUrl(source.baseUrl)) throw new Error('Base URL must be HTTP(S), without credentials, query or fragment.');
    result.baseUrl = source.baseUrl.replace(/\/$/, '');
  }
  if (source.maxTokens !== undefined) {
    if (typeof source.maxTokens !== 'number' || !Number.isSafeInteger(source.maxTokens) || source.maxTokens < 1) throw new Error('Output limit must be a positive integer.');
    result.maxTokens = source.maxTokens;
  }
  // Deliberately copy only known fields: an accidental apiKey can never persist.
  return result;
}

export function readModelPreferences(path = preferencesPath()): ModelPreferences {
  let contents: string;
  try { contents = readFileSync(path, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`Cannot read model preferences at ${path}.`);
  }
  try { return validatePreferences(JSON.parse(contents)); }
  catch { throw new Error(`Invalid model preferences at ${path}. Open the selector to replace them.`); }
}

/** Prepare a preference change without altering the current defaults. */
export function prepareModelPreferences(preferences:ModelPreferences,path=preferencesPath()):{commit():void;discard():void} {
  const clean=validatePreferences(preferences);
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  if(existsSync(path) && !statSync(path).isFile())throw new Error("Model preferences destination is not a regular file.");
  const temporary=`${path}.${randomUUID()}.pending`;
  try {writeFileSync(temporary,`${JSON.stringify(clean,null,2)}\n`,{flag:'wx',mode:0o600});}
  catch(cause){rmSync(temporary,{force:true});throw cause;}
  return {commit(){try{renameSync(temporary,path);}finally{rmSync(temporary,{force:true});}},discard(){rmSync(temporary,{force:true});}};
}
export function saveModelPreferences(preferences: ModelPreferences, path = preferencesPath()): void {
  prepareModelPreferences(preferences,path).commit();
}

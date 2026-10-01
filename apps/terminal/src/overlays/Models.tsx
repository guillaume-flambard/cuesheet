import React, { useEffect, useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { PROVIDERS, type ModelPreferences } from '../../../../src/adapters/model-preferences.ts';
import type { CatalogModel } from '../../../../src/adapters/model-catalog.ts';

export interface ModelsProps {
  selection: ModelPreferences;
  rows: number;
  busy: boolean;
  list(choice: ModelPreferences, signal: AbortSignal): Promise<CatalogModel[]>;
  apply(choice: ModelPreferences, save: boolean): { error: string } | { ok: true };
  onClose(): void;
}

type Stage = 'provider' | 'endpoint' | 'model' | 'limit' | 'confirm';
export function Models(props: ModelsProps): JSX.Element {
  const [stage, setStage] = useState<Stage>('provider');
  const [choice, setChoice] = useState<ModelPreferences>(props.selection);
  const [at, setAt] = useState(Math.max(0, PROVIDERS.indexOf(props.selection.provider ?? 'opencode')));
  const [input, setInput] = useState('');
  const query = useRef(input);
  query.current = input;
  const [manual, setManual] = useState(false);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [save, setSave] = useState(true);
  useEffect(() => {
    if (stage !== 'model') return;
    const controller = new AbortController();
    let current = true;
    setLoading(true); setCatalog([]); setError('');
    props.list(choice, controller.signal).then(models => {
      if (current) {
        const available = choice.provider === 'opencode' ? [{ id: '', name: 'Modèle configuré dans OpenCode' }, ...models] : models;
        setCatalog(available);
        setAt(query.current ? 0 : Math.max(0, available.findIndex(model => model.id === (choice.model ?? ''))));
        setLoading(false);
      }
    }, cause => {
      if (current) { setError(cause instanceof Error ? cause.message : 'Catalogue indisponible.'); setLoading(false); }
    });
    return () => { current = false; controller.abort(); };
  }, [stage, choice.provider, choice.baseUrl, props.list]);
  const filtered = catalog.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(input.toLowerCase()));
  const items = stage === 'provider' ? [...PROVIDERS] : stage === 'model' && !manual ? filtered.map(model => model.id) : [];
  const selected = Math.min(at, Math.max(0, items.length - 1));
  const visible = Math.max(1, props.rows - 3);
  const start = Math.max(0, selected - visible + 1);
  const enterModel = (next: ModelPreferences) => {
    setChoice(next); setInput(''); setAt(0); setManual(false); setStage('model'); setError('');
  };
  useInput((text, key) => {
    if (key.ctrl || key.meta) return;
    if (key.escape) return props.onClose();
    if (key.tab && stage === 'model') { setManual(value => !value); setAt(0); return; }
    if (key.upArrow || key.downArrow) {
      if (stage === 'confirm') setSave(value => !value);
      else setAt(value => Math.max(0, Math.min(items.length - 1, value + (key.downArrow ? 1 : -1))));
      return;
    }
    if (key.return) {
      if (stage === 'provider') {
        const provider = PROVIDERS[selected]!;
        const next: ModelPreferences = provider === choice.provider ? { ...choice, provider } : { provider };
        if (provider === 'compatible') { setChoice(next); setInput(next.baseUrl ?? ''); setStage('endpoint'); setError(''); }
        else enterModel(next);
      } else if (stage === 'endpoint') {
        // Validation belongs to the controller/catalog. The user can correct errors here.
        if (!input.trim()) { setError('URL requise, incluant /v1.'); return; }
        enterModel({ ...choice, baseUrl: input.trim() });
      } else if (stage === 'model') {
        const model = !manual && filtered[selected] ? filtered[selected]!.id : input.trim();
        if (!model && choice.provider !== 'opencode') { setError('Saisis un modèle ou choisis dans le catalogue.'); return; }
        setChoice({ ...choice, model: model || undefined });
        setInput(choice.maxTokens?.toString() ?? '');
        if (choice.provider === 'opencode') { setChoice({ ...choice, model: model || undefined, maxTokens: undefined }); setStage('confirm'); }
        else setStage('limit');
        setError('');
      } else if (stage === 'limit') {
        const maxTokens = input.trim() ? Number(input) : undefined;
        if (choice.provider === 'anthropic' && maxTokens === undefined) { setError('Anthropic exige une limite de sortie explicite.'); return; }
        if (maxTokens !== undefined && (!Number.isSafeInteger(maxTokens) || maxTokens < 1)) { setError('Limite : entier positif, ou vide.'); return; }
        setChoice({ ...choice, maxTokens }); setStage('confirm'); setError('');
      } else {
        const result = props.apply(choice, save);
        if ('error' in result) { setError(result.error); setStage('provider'); setAt(Math.max(0, PROVIDERS.indexOf(choice.provider ?? 'opencode'))); }
        else props.onClose();
      }
      return;
    }
    if (stage === 'provider' || stage === 'confirm') return;
    if (key.backspace || key.delete) setInput(value => Array.from(value).slice(0, -1).join(''));
    else if (text) setInput(value => value + text.replace(/[\r\n\x00-\x1f\x7f]/g, ''));
    setAt(0);
  });
  const title = stage === 'provider' ? 'Provider et modèle' : `${choice.provider} · ${stage === 'endpoint' ? 'URL du serveur' : stage === 'model' ? 'Modèle' : stage === 'limit' ? 'Limite de sortie' : 'Appliquer'}`;
  return <Box flexDirection="column" height={props.rows} overflow="hidden">
    <Text bold wrap="truncate-end">{title}</Text>
    {stage === 'provider' ? items.slice(start, start + visible).map((item, index) => <Text key={item} wrap="truncate-end">{start + index === selected ? '› ' : '  '}{item}</Text>) : stage === 'confirm' ? <>
      <Text wrap="truncate-end">{choice.model ?? 'Modèle configuré dans OpenCode'}</Text>
      {choice.baseUrl && <Text wrap="truncate-end">{choice.baseUrl}</Text>}
      <Text wrap="truncate-end">{choice.provider === 'opencode' ? 'Limite configurée dans OpenCode' : choice.maxTokens ? `${choice.maxTokens} tokens` : 'Limite du provider'} · {save ? 'Appliquer et sauvegarder' : 'Appliquer pour ce terminal'}</Text>
    </> : <>
      <Text wrap="truncate-start">{stage === 'model' ? (manual ? 'ID libre' : 'Recherche') : stage === 'limit' ? (choice.provider === 'anthropic' ? 'Tokens (requis)' : 'Tokens (vide : défaut)') : 'URL'} : {input}<Text inverse> </Text></Text>
      {stage === 'model' && !manual && filtered.slice(start, start + Math.max(1, visible - 1)).map((model, index) => <Text key={model.id} wrap="truncate-end">{start + index === selected ? '› ' : '  '}{model.id || model.name}</Text>)}
    </>}
    <Text wrap="truncate-end" dimColor>{error || (props.busy ? 'Travail en cours : le nouveau modèle prendra la suite.' : loading ? 'Chargement… Tab : ID libre · Esc : retour' : stage === 'model' ? `${catalog.length} modèles · Tab : ID libre · Entrée : choisir · Esc : retour` : stage === 'confirm' ? '↑↓ : sauvegarde · Entrée : appliquer · Esc : retour' : '↑↓ : choisir · Entrée : continuer · Esc : retour')}</Text>
  </Box>;
}

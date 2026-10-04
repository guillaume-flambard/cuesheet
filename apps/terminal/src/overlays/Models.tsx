import React, { useEffect, useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import {SelectionRow,ViewTitle} from '../components/Surface.tsx';
import {theme,inkColor} from '../theme/tokens.ts';
import { PROVIDERS, type ModelPreferences } from '../../../../src/adapters/model-preferences.ts';
import type { CatalogModel } from '../../../../src/adapters/model-catalog.ts';

export interface ModelsProps {
  width?:number;
  titlePrefix?:string;
  sessionOnly?:boolean;
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
  const [save, setSave] = useState(!props.sessionOnly);
  useEffect(() => {
    if (stage !== 'model') return;
    const controller = new AbortController();
    let current = true;
    setLoading(true); setCatalog([]); setError('');
    props.list(choice, controller.signal).then(models => {
      if (current) {
        const available = choice.provider === 'opencode' ? [{ id: '', name: 'Configured OpenCode model' }, ...models] : models;
        setCatalog(available);
        setAt(query.current ? 0 : Math.max(0, available.findIndex(model => model.id === (choice.model ?? ''))));
        setLoading(false);
      }
    }, cause => {
      if (current) { setError(cause instanceof Error ? cause.message : 'Catalog unavailable.'); setLoading(false); }
    });
    return () => { current = false; controller.abort(); };
  }, [stage, choice.provider, choice.baseUrl, props.list]);
  const filtered = catalog.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(input.toLowerCase()));
  const items = stage === 'provider' ? [...PROVIDERS] : stage === 'model' && !manual ? filtered.map(model => model.id) : [];
  const selected = Math.min(at, Math.max(0, items.length - 1));
  const visible = Math.max(1, Math.min(8,props.rows - 5));
  const displayed = stage === "model" ? Math.max(1, visible - 1) : visible;
  const start = Math.max(0, selected - displayed + 1);
  const enterModel = (next: ModelPreferences) => {
    setChoice(next); setInput(''); setAt(0); setManual(false); setStage('model'); setError('');
  };
  useInput((text, key) => {
    if (key.ctrl || key.meta) return;
    if (key.escape) return props.onClose();
    if (key.tab && stage === 'model') { setManual(value => !value); setAt(0); return; }
    if (key.upArrow || key.downArrow) {
      if (stage === 'confirm' && !props.sessionOnly) setSave(value => !value);
      else setAt(value => Math.max(0, Math.min(items.length - 1, value + (key.downArrow ? 1 : -1))));
      return;
    }
    if (key.return || text === "\n") {
      if (stage === 'provider') {
        const provider = PROVIDERS[selected]!;
        const next: ModelPreferences = provider === choice.provider ? { ...choice, provider } : { provider };
        if (provider === 'compatible') { setChoice(next); setInput(next.baseUrl ?? ''); setStage('endpoint'); setError(''); }
        else enterModel(next);
      } else if (stage === 'endpoint') {
        // Validation belongs to the controller/catalog. The user can correct errors here.
        if (!input.trim()) { setError('URL required, including /v1.'); return; }
        enterModel({ ...choice, baseUrl: input.trim() });
      } else if (stage === 'model') {
        const model = !manual && filtered[selected] ? filtered[selected]!.id : input.trim();
        if (!model && choice.provider !== 'opencode') { setError('Enter a model ID or choose from the catalog.'); return; }
        setChoice({ ...choice, model: model || undefined });
        setInput(choice.maxTokens?.toString() ?? '');
        if (choice.provider === 'opencode') { setChoice({ ...choice, model: model || undefined, maxTokens: undefined }); setStage('confirm'); }
        else setStage('limit');
        setError('');
      } else if (stage === 'limit') {
        const maxTokens = input.trim() ? Number(input) : undefined;
        if (choice.provider === 'anthropic' && maxTokens === undefined) { setError('Anthropic requires an explicit output limit.'); return; }
        if (maxTokens !== undefined && (!Number.isSafeInteger(maxTokens) || maxTokens < 1)) { setError('Limit: a positive integer, or blank.'); return; }
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
  const title = stage === 'provider' ? 'Provider and model' : `${choice.provider} · ${stage === 'endpoint' ? 'Server URL' : stage === 'model' ? 'Model' : stage === 'limit' ? 'Output limit' : 'Apply'}`;
  return <Box flexDirection="column" height={props.rows} overflow="hidden">
    <ViewTitle compact={props.rows<6} title={props.titlePrefix ? `${props.titlePrefix} · ${title}` : title} detail={items.length?`${selected+1} / ${items.length}`:undefined}/>
    {stage === 'provider' ? items.slice(start, start + visible).map((item, index) => <SelectionRow key={item} width={Math.min(props.width??64,80)} selected={start+index===selected} label={item} detail={item===props.selection.provider?'current':''}/>) : stage === 'confirm' ? <>
      <Text wrap="truncate-end">{choice.model ?? 'Configured OpenCode model'}</Text>
      {choice.baseUrl && <Text wrap="truncate-end">{choice.baseUrl}</Text>}
      <Text wrap="truncate-end">{choice.provider === 'opencode' ? 'Limit configured in OpenCode' : choice.maxTokens ? `${choice.maxTokens} tokens` : 'Provider limit'} · {props.sessionOnly ? 'Apply to this session' : save ? 'Apply and save' : 'Apply to this terminal'}</Text>
    </> : <>
      <Text wrap="truncate-start">{stage === 'model' ? (manual ? 'Manual ID' : 'Search') : stage === 'limit' ? (choice.provider === 'anthropic' ? 'Tokens (required)' : 'Tokens (blank: default)') : 'URL'} : {input}<Text inverse> </Text></Text>
      {stage === 'model' && !manual && filtered.slice(start, start + displayed).map((model, index) => <SelectionRow key={model.id} width={Math.min(props.width??64,80)} selected={start+index===selected} label={model.id||model.name} detail={model.id===(props.selection.model??'')?'current':''}/>)}
    </>}
    <Text wrap="truncate-end" color={inkColor(error?theme.failed:theme.faint)}>{error || (props.busy ? 'Work is running: the new model applies to the next inference.' : loading ? 'Loading models… Tab manual ID · Esc close' : stage === 'model' ? `${catalog.length} models · Tab : Manual ID · Enter: choose · Esc: back` : stage === 'confirm' ? props.sessionOnly ? 'Enter: apply · Esc: back' : '↑↓: save preference · Enter: apply · Esc: back' : '↑↓ choose · Enter continue · Esc close')}</Text>
  </Box>;
}

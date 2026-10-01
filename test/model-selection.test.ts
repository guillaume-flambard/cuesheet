import { it } from 'node:test';
import assert from 'node:assert/strict';
import { surfaceEnvironment } from '../src/surface-cli.ts';
import { resolveModel } from '../src/adapters/default-model.ts';

it('terminal preserves selections and named credentials, flags override environment', () => {
  const env = surfaceEnvironment(['--provider', 'openai', '--model', 'chosen', '--max-tokens', '2048'], {
    CUESHEET_PROVIDER: 'openrouter', CUESHEET_MODEL: 'old', OPENAI_API_KEY: 'secret', UNRELATED_SECRET: 'hidden',
  });
  assert.equal(env.CUESHEET_PROVIDER, 'openai');
  assert.equal(env.CUESHEET_MODEL, 'chosen');
  assert.equal(env.OPENAI_API_KEY, 'secret');
  assert.equal(env.CUESHEET_MAX_TOKENS, '2048');
  assert.equal(env.UNRELATED_SECRET, undefined);
  assert.throws(() => surfaceEnvironment(['--model']));
  assert.throws(() => surfaceEnvironment(['--model','one','--model','two']));
});

it('unknown providers refuse instead of falling back', () => {
  const result = resolveModel({ provider: 'typo' });
  assert.ok('missing' in result);
  assert.match(result.missing, /Unknown provider/);
});

it('direct OpenAI and compatible transport use selected model, endpoint, ceiling and cancellation', async () => {
  const saved = { ...process.env };
  const original = globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.CUESHEET_MAX_TOKENS = '2048';
    process.env.CUESHEET_BASE_URL = 'http://127.0.0.1:9999/v1/';
    delete process.env.CUESHEET_API_KEY;
    for (const provider of ['openai','compatible']) {
      const resolved = resolveModel({ provider, model: 'selected-model' });
      assert.ok(!('missing' in resolved));
      const abort = new AbortController();
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url), provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'http://127.0.0.1:9999/v1/chat/completions');
        const body = JSON.parse(String(options?.body));
        assert.equal(body.model, 'selected-model');
        assert.equal(body[provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'], 2048);
        assert.equal(options?.signal, abort.signal);
        assert.equal((options?.headers as Record<string,string>).authorization, provider === 'openai' ? 'Bearer test-key' : undefined);
        return Response.json({choices:[{message:{content:'ok',tool_calls:[{function:{name:'tool_call',arguments:JSON.stringify({tool:'cat',input:{path:'a'}})}}]}}]});
      };
      const result = await (resolved.adapter as any).infer({model:'unset',goal:'g',step:0,directives:[],evidence:[],capabilities:[],history:[]}, abort.signal);
      assert.equal(result.text,'ok');
      assert.equal(result.toolCalls[0].name,'cat');
    }
    process.env.CUESHEET_BASE_URL = 'file:///tmp';
    assert.ok('missing' in resolveModel({provider:'compatible',model:'m'}));
    process.env.CUESHEET_MAX_TOKENS = '0';
    assert.ok('missing' in resolveModel({provider:'openai',model:'m'}));
  } finally {
    globalThis.fetch = original;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env,saved);
  }
});

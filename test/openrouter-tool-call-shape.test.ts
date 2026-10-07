import { it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenRouterAdapter } from '../src/adapters/openrouter.ts';
import { ShellToolRunner } from '../src/adapters/shell.ts';

const frame = { model: 'unset', goal: 'g', step: 0, directives: [], evidence: [], capabilities: [], history: [] } as any;

async function callWith(args: unknown, functionName = 'tool_call') {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '', tool_calls: [{ id: 'c1', function: { name: functionName, arguments: JSON.stringify(args) } }] } }] });
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key', model: 'm' } as any);
    return (await adapter.infer(frame)).toolCalls[0]!;
  } finally { globalThis.fetch = original; }
}

it('a call that follows the advertised contract reaches the runner with its inner input', async () => {
  const call = await callWith({ tool: 'ls', input: { argv: ['ls', '-la'] } });
  assert.equal(call.name, 'ls');
  assert.deepEqual(call.input, { argv: ['ls', '-la'] });
});

it('the contract shape with a path is unwrapped too', async () => {
  const call = await callWith({ tool: 'cat', input: { path: 'packages/core/src/audit-diff.ts' } });
  assert.equal(call.name, 'cat');
  assert.deepEqual(call.input, { path: 'packages/core/src/audit-diff.ts' });
});

it('the flat shape keeps its previous meaning', async () => {
  const call = await callWith({ tool: 'ls', argv: ['ls', '-la'] });
  assert.equal(call.name, 'ls');
  assert.deepEqual(call.input, { tool: 'ls', argv: ['ls', '-la'] });
});

it('a missing tool field falls back to the function name, and an empty input stays empty', async () => {
  const call = await callWith({}, 'ls');
  assert.equal(call.name, 'ls');
  assert.deepEqual(call.input, {});
});

it('an array or null inner input is not unwrapped', async () => {
  const array = await callWith({ tool: 'ls', input: ['ls'] });
  assert.deepEqual(array.input, { tool: 'ls', input: ['ls'] });
  const none = await callWith({ tool: 'ls', input: null });
  assert.deepEqual(none.input, { tool: 'ls', input: null });
});

it('end to end: a contract-shaped ls is executed instead of answering "no argv supplied"', async () => {
  const call = await callWith({ tool: 'ls', input: { argv: ['ls', '-la'] } });
  const runner = new ShellToolRunner({ allow: ['ls'], roots: [process.cwd()], defaultCwd: process.cwd() } as any);
  const result = await runner.run(call as any);
  assert.notEqual(result.output, 'no argv supplied');
  assert.equal(result.exit, 0);
});

it('a request always carries a user turn after the system message, which Google compatible endpoints require', async () => {
  const original = globalThis.fetch;
  let body: any;
  try {
    globalThis.fetch = async (_url, options) => { body = JSON.parse(String(options?.body)); return Response.json({ choices: [{ message: { content: 'ok', tool_calls: [] } }] }); };
    await new OpenRouterAdapter({ apiKey: 'test-key', model: 'm' } as any).infer(frame);
  } finally { globalThis.fetch = original; }
  assert.equal(body.messages[0].role, 'system');
  assert.ok(body.messages.slice(1).some((m: any) => m.role === 'user' && String(m.content).length > 0), 'no user turn in the request');
});

it('CUESHEET_MIN_INTERVAL_MS spaces the starts of two requests, and unset leaves them unpaced', async () => {
  const original = globalThis.fetch, saved = process.env.CUESHEET_MIN_INTERVAL_MS;
  const starts: number[] = [];
  try {
    globalThis.fetch = async () => { starts.push(Date.now()); return Response.json({ choices: [{ message: { content: 'ok', tool_calls: [] } }] }); };
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key', model: 'm' } as any);
    process.env.CUESHEET_MIN_INTERVAL_MS = '200';
    await adapter.infer(frame); await adapter.infer(frame); await adapter.infer(frame);
    assert.ok(starts[1]! - starts[0]! >= 180, `second start only ${starts[1]! - starts[0]!} ms after the first`);
    assert.ok(starts[2]! - starts[1]! >= 180, `third start only ${starts[2]! - starts[1]!} ms after the second`);
    delete process.env.CUESHEET_MIN_INTERVAL_MS;
    starts.length = 0;
    await adapter.infer(frame); await adapter.infer(frame);
    assert.ok(starts[1]! - starts[0]! < 150, 'unset must not pace');
  } finally { globalThis.fetch = original; if (saved === undefined) delete process.env.CUESHEET_MIN_INTERVAL_MS; else process.env.CUESHEET_MIN_INTERVAL_MS = saved; }
});

it('an abort during the pacing wait rejects instead of sending', async () => {
  const original = globalThis.fetch, saved = process.env.CUESHEET_MIN_INTERVAL_MS;
  let sent = 0;
  try {
    globalThis.fetch = async () => { sent++; return Response.json({ choices: [{ message: { content: 'ok', tool_calls: [] } }] }); };
    process.env.CUESHEET_MIN_INTERVAL_MS = '5000';
    const adapter = new OpenRouterAdapter({ apiKey: 'test-key', model: 'm' } as any);
    await adapter.infer(frame);
    const abort = new AbortController();
    const pending = adapter.infer(frame, abort.signal);
    setTimeout(() => abort.abort(new Error('stop')), 50);
    await assert.rejects(pending, /stop/);
    assert.equal(sent, 1);
  } finally { globalThis.fetch = original; if (saved === undefined) delete process.env.CUESHEET_MIN_INTERVAL_MS; else process.env.CUESHEET_MIN_INTERVAL_MS = saved; }
});

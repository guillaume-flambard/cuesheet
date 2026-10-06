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

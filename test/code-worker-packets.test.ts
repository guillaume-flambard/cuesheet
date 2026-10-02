import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCodeWorkerPackets} from '../src/adapters/code-worker-packets.ts';
const task = (role = 'builder', files = ['src/adapter.ts']) => ({role, task: 'Preserve public API\nImplement the specified behavior', files});
test('independent responsibilities are copied and immutable before asynchronous admission', () => {
  const input = {tasks: [{...task(), skills: ['code-review']}, task('tester', ['test/adapter.test.ts'])]};
  const packets = parseCodeWorkerPackets(input);
  input.tasks[0]!.files[0] = '../outside'; input.tasks[0]!.task = 'changed after admission';
  assert.equal(packets[0]!.files[0], 'src/adapter.ts');
  assert.match(packets[0]!.task, /Preserve public API/);
  assert.deepEqual(packets[0]!.skills, ['code-review']);
  assert.ok(Object.isFrozen(packets)); assert.ok(Object.isFrozen(packets[0]));
  assert.ok(Object.isFrozen(packets[0]!.files)); assert.ok(Object.isFrozen(packets[0]!.skills));
});
test('conflicting plans are refused regardless of order and platform case sensitivity', () => {
  for (const [a, b] of [['src', 'src/a.ts'], ['src/a.ts', 'src/a.ts'], ['Src/A.ts', 'src/a.ts'], ['café.ts', 'cafe\u0301.ts']]) {
    for (const [first, second] of [[a!, b!], [b!, a!]]) {
      assert.throws(() => parseCodeWorkerPackets({tasks: [task('builder', [first!]), task('tester', [second!])]}));
    }
  }
  assert.throws(() => parseCodeWorkerPackets({tasks: [task('builder', ['src', 'src/a.ts'])]}));
  assert.equal(parseCodeWorkerPackets({tasks: [task('builder', ['src/a.ts', 'src/ab.ts'])]}).length, 1);
});
test('absolute, traversal, cache, credential and ambiguous portable paths are refused', () => {
  for (const file of ['/tmp/x', '../x', 'a/../b', './a', 'a//b', 'a/', 'C:/x', 'a\\b',
    '.git/config', 'a/.Git/config', '.cuesheet/state', 'node_modules/pkg/a', '.npm/x',
    'a/.npmrc', '.pypirc', '.env', 'a/.env.local', 'a\0b', 'a\nb', 'a*', 'a[0]',
    ' a', 'a ', 'a./b', 'a/ b', 'a/b ', 'CON', 'a/nul.txt', 'a/LPT1', 'x'.repeat(241)]) {
    assert.throws(() => parseCodeWorkerPackets({tasks: [task('builder', [file])]}), file);
  }
  assert.equal(parseCodeWorkerPackets({tasks: [task('builder', ['docs/French café.md'])]}).length, 1);
});
test('untrusted proposals cannot add authority or silently enlarge a bounded batch', () => {
  const invalid = [null, {}, {tasks: []}, {tasks: [task(), task('a'), task('b')]},
    {tasks: [task()], cwd: '/source'}, {tasks: [{...task(), tools: ['node']}]},
    {tasks: [{...task(), model: 'paid-provider'}]}, {tasks: [task(), task()]},
    {tasks: [task('invalid role')]}, {tasks: [{...task(), files: []}]},
    {tasks: [{...task(), files: Array.from({length: 33}, (_, i) => `src/${i}`)}]},
    {tasks: [{...task(), task: ' '}]}, {tasks: [{...task(), task: 'x'.repeat(4001)}]},
    {tasks: [{...task(), skills: ['review', 'review']}]}, {tasks: [{...task(), skills: ['../skill']}]},
    {tasks: [{...task(), files: [false]}]}, {tasks: [{...task(), task: 'x\0y'}]}];
  for (const proposal of invalid) assert.throws(() => parseCodeWorkerPackets(proposal));
});

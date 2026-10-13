import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listModels } from '../src/adapters/model-catalog.ts';

test('OpenCode v2 model catalog works without the removed --pure option', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cuesheet-opencode-v2-'));
  try {
    const binary = join(root, 'opencode');
    writeFileSync(binary, '#!' + process.execPath + '\n'
      + 'const args=process.argv.slice(2);\n'
      + 'if(args.join(" ")!=="models") process.exit(21);\n'
      + 'console.log("provider/second\\nprovider/first");\n');
    chmodSync(binary, 0o700);
    const result=await listModels({provider:'opencode'}, {env:{CUESHEET_OPENCODE_BIN:binary},timeoutMs:2000});
    assert.deepEqual(result.map(m=>m.id),['provider/first','provider/second']);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

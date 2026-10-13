import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {listModels} from '../src/adapters/model-catalog.ts';

test('OpenCode catalog prioritizes configured providers without claiming authentication', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cuesheet-configured-models-'));
  try {
    const binary = join(root, 'opencode');
    writeFileSync(binary, '#!' + process.execPath + '\n' +
      'const args=process.argv.slice(2).join(" ");\n' +
      'if(args==="models"){console.log("bai/unknown\\ngoogle/gemini\\nopenrouter/free\\nollama/local");process.exit(0);}\n' +
      'if(args==="auth list"){console.log("Google       GEMINI_API_KEY         environment\\nOpenRouter    API key               stored\\nBai");process.exit(0);}\n' +
      'process.exit(21);\n');
    chmodSync(binary, 0o700);
    const models = await listModels({provider:'opencode'}, {env:{CUESHEET_OPENCODE_BIN:binary},timeoutMs:2000});
    assert.deepEqual(models.map(m=>m.id),['google/gemini','openrouter/free','bai/unknown','ollama/local']);
    assert.deepEqual(models.map(m=>!!m.configured),[true,true,false,false]);
    assert.ok(!JSON.stringify(models).includes('GEMINI_API_KEY'), 'auth metadata must never escape');
  } finally {rmSync(root,{recursive:true,force:true});}
});

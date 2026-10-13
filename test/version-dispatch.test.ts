import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

test('cuesheet version terminates without recursively spawning its own dispatcher',()=>{
  const entry=resolve('src/cuesheet.ts');
  for(const argv of [['version'],['--version']]){
    const run=spawnSync(process.execPath,[entry,...argv],{encoding:'utf8',timeout:3000});
    assert.equal(run.error,undefined,String(run.error));
    assert.equal(run.status,0,run.stderr);
    assert.match(run.stdout.trim(),/^\d+\.\d+\.\d+$/);
  }
});

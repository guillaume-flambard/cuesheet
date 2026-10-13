import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frenchCount} from '../apps/terminal/src/components/french-count.ts';

test('French counters are readable and properly inflected',()=>{
 assert.equal(frenchCount(1,'notification'),'1 notification');
 assert.equal(frenchCount(2,'notification'),'2 notifications');
 assert.equal(frenchCount(1,'échec'),'1 échec');
 assert.equal(frenchCount(3,'échec'),'3 échecs');
 assert.equal(frenchCount(1,'lu'),'1 lu');
 assert.equal(frenchCount(2,'modifié'),'2 modifiés');
});

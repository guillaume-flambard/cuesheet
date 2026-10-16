import {test} from 'node:test';import assert from 'node:assert/strict';import {statusHints} from '../apps/terminal/src/components/status-hints.ts';

test('a narrow terminal keeps a guide when nothing is running',()=>{
 assert.equal(statusHints({busy:false,width:40}),'Ctrl+P models · Ctrl+K commands');
});

test('the interrupt survives every width, including where the guide is dropped',()=>{
 for(const width of [20,40,59,60,80,160]){
  assert.match(statusHints({busy:true,width}),/Ctrl\+C stop/,`width ${width}`);
 }
 assert.equal(statusHints({busy:true,width:40}),'Ctrl+C stop · Ctrl+K commands');
 assert.match(statusHints({busy:true,width:80}),/^Enter redirect · Ctrl\+C stop/);
});

test('an overlay owns the line while it is open',()=>{
 assert.equal(statusHints({overlay:'work',busy:true,width:80}),'Esc back · inspection keeps your draft');
 assert.equal(statusHints({overlay:'none',targeted:true,busy:true,width:80}),'Enter correct selected work · Esc detach target');
});

test('the idle guide names the send key and the two menus',()=>{
 assert.equal(statusHints({busy:false,width:80}),'Enter send · Tab inspect · Ctrl+P models · Ctrl+K commands');
});

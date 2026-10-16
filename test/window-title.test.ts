import {test} from 'node:test';import assert from 'node:assert/strict';import {windowTitle,oscTitle} from '../apps/terminal/src/app/window-title.ts';

test('the window title names the live task, not the product channel',()=>{
 assert.equal(windowTitle({intent:'Fix the resize path',project:'cuesheet'}),'cuesheet · Fix the resize path');
 assert.equal(windowTitle({intent:'   ',project:'cuesheet'}),'cuesheet · cuesheet');
 assert.equal(windowTitle({intent:null,project:null}),'cuesheet');
});

test('task text cannot smuggle terminal control sequences into the title',()=>{
 const hostile='ok\u0007\u001b]2;pwned\u0007\nsecond\u009bline';
 const title=windowTitle({intent:hostile,project:'cuesheet'});
 assert.ok(!/[\u0000-\u001f\u007f-\u009f]/u.test(title),JSON.stringify(title));
 assert.ok(!title.includes('\n'),JSON.stringify(title));
 assert.equal(title,'cuesheet · ok ]2;pwned second line');
 const frame=oscTitle(hostile);
 assert.ok(!/[\u0000-\u001f\u007f-\u009f]/u.test(frame.slice(4,-1)),JSON.stringify(frame));
 assert.equal(frame,'\u001b]0;ok ]2;pwned second line\u0007');
});

test('the title is one line inside its cell budget',()=>{
 const long=windowTitle({intent:'a '.repeat(200),project:'cuesheet'});
 assert.ok(long.endsWith('…'),long);
 assert.ok(long.length<=72,`length ${long.length}: ${long}`);
 assert.ok(long.length>60,`collapsed too far: ${long}`); // the ellipsis costs one cell, not the tail
});

test('an empty payload is the reset, and the frame is OSC 0',()=>{
 assert.equal(oscTitle('cuesheet'),'\u001b]0;cuesheet\u0007');
 assert.equal(oscTitle(''),'\u001b]0;\u0007');
});

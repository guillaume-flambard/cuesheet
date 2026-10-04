import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
test('production and terminal type checks both succeed',()=>{
 const root=process.cwd();
 execFileSync(join(root,'node_modules/.bin/tsc'),['-p','tsconfig.build.json','--noEmit'],{cwd:root,stdio:'pipe'});
 execFileSync(join(root,'apps/terminal/node_modules/.bin/tsc'),['-p','apps/terminal/tsconfig.json','--noEmit'],{cwd:root,stdio:'pipe'});
});

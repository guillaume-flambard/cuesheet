const {createRequire}=require('node:module');
const {mkdirSync,writeFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const readline=require('node:readline');
const path=require('node:path');
const repo=path.resolve(__dirname,'../..');
const root=process.env.CUESHEET_VISUAL_TOOLS;
if(!root)throw Error('Set CUESHEET_VISUAL_TOOLS to the directory containing @xterm/headless and capture outputs.');
const pty=createRequire(repo+'/apps/terminal/package.json')('node-pty');
const {Terminal}=createRequire(path.join(root,'package.json'))('@xterm/headless');
let cols=120,rows=30,raw='',pending=Promise.resolve();
const term=new Terminal({cols,rows,allowProposedApi:true,scrollback:1000});
const session=process.env.CUESHEET_VISUAL_SESSION_ROOT||root+'/sessions-'+Date.now();mkdirSync(session,{recursive:true});
const child=pty.spawn('/Users/memo/.local/bin/cuesheet',[],{cwd:repo,name:'xterm-256color',cols,rows,env:{...process.env,TERM:'xterm-256color',COLORTERM:'truecolor',CUESHEET_SESSIONS:session}});
child.onData(s=>{raw+=s;pending=pending.then(()=>new Promise(r=>term.write(s,r)));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function snapshot(name){await pending;name=name.replace(/[^a-z0-9_-]/gi,'_');const grid=[];for(let y=0;y<rows;y++){const line=term.buffer.active.getLine(term.buffer.active.viewportY+y),cells=[];for(let x=0;x<cols;x++){const c=line?.getCell(x);cells.push(c?{text:c.getChars(),width:c.getWidth(),fg:c.getFgColor(),fgMode:c.getFgColorMode(),bg:c.getBgColor(),bgMode:c.getBgColorMode(),bold:c.isBold(),inverse:c.isInverse()}:{});}grid.push(cells);}const path=root+'/'+name;writeFileSync(path+'.json',JSON.stringify({cols,rows,grid}));writeFileSync(path+'.raw',raw);const p=spawnSync('/Users/memo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',[repo+'/scripts/ui/visual-render.py',path+'.json'],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);console.log(JSON.stringify({snapshot:path+'.png',text:grid.map(r=>r.map(c=>c.text||' ').join('').trimEnd()).join('\n')}));}
(async()=>{const deadline=Date.now()+20000;while(!raw.includes('Enter send')&&Date.now()<deadline)await wait(100);if(!raw.includes('Enter send'))throw Error('Startup timeout');console.log(JSON.stringify({ready:true,session}));await snapshot('idle');const input=readline.createInterface({input:process.stdin});for await(const line of input){try{const action=JSON.parse(line);if(action.send!==undefined){child.write(action.send);await wait(action.wait??250);}if(action.resize){[cols,rows]=action.resize;term.resize(cols,rows);child.resize(cols,rows);await wait(350);}if(action.snapshot)await snapshot(action.snapshot);if(action.quit){child.kill();input.close();break;}}catch(e){console.log(JSON.stringify({error:e.message}));}}child.kill();})().catch(e=>{child.kill();console.error(e);process.exitCode=1;});

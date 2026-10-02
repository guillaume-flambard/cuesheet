/** Real, isolated portfolio for legacy tests; never the developer's private registry. */
import {after} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {execFileSync} from 'node:child_process';
const original=process.env.HOME;
export const portfolioHome=realpathSync(mkdtempSync(join(tmpdir(),'cs-test-portfolio-')));
const projects=join(portfolioHome,'projects');mkdirSync(projects);
const rows=['| Name | Path | Kind | Status | Nature | Stack |'];
for(let index=0;index<12;index++){
 const name=index===0?'cuesheet':'fixture-'+index,path='tools/'+name,dir=join(projects,path);mkdirSync(dir,{recursive:true});
 const env={PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:portfolioHome,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,env,stdio:'pipe'});
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');writeFileSync(join(dir,'source.txt'),'fixture');git('add','.');git('commit','-qm','base');
 if(index===1)writeFileSync(join(dir,'source.txt'),'human pending');
 rows.push(`| ${name} | ${path} | repo | active | tool | TypeScript |`);
}
writeFileSync(join(projects,'PROJECTS.md'),rows.join('\n'));
process.env.HOME=portfolioHome;
after(()=>{if(original===undefined)delete process.env.HOME;else process.env.HOME=original;rmSync(portfolioHome,{recursive:true,force:true});});

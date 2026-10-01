/** The installed terminal is self-contained JavaScript, not a checkout launcher. */
import {createRequire,isBuiltin} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdirSync,copyFileSync,readFileSync,writeFileSync,readdirSync,existsSync,statSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const terminal=join(root,'apps','terminal');const require=createRequire(join(terminal,'package.json'));
let esbuild;
try{esbuild=await import(pathToFileURL(require.resolve('esbuild')).href);}catch{throw new Error('Terminal build dependencies unavailable. Install workspace dependencies before building.');}
const out=join(root,'dist','apps','terminal');mkdirSync(out,{recursive:true});
const releaseInk={name:'release-ink-devtools',setup(build){
 build.onLoad({filter:/[/\\]ink[/\\]build[/\\](ink|reconciler)\.js$/},args=>{
  const source=readFileSync(args.path,'utf8');const condition="process.env['DEV'] === 'true'";
  if(!source.includes(condition))throw new Error('Ink devtools guard changed; review release bundling before shipping.');
  return {contents:source.replaceAll(condition,'false'),loader:'js'};
 });
}};
const result=await esbuild.build({absWorkingDir:root,entryPoints:[join(terminal,'src','main.tsx')],outfile:join(out,'main.mjs'),
 plugins:[releaseInk],bundle:true,platform:'node',format:'esm',target:'node22',metafile:true,minifySyntax:true,legalComments:'linked',define:{'process.env.NODE_ENV':'"production"','process.env.DEV':'"false"'},
 banner:{js:"import {createRequire as __cuesheetCreateRequire} from 'node:module'; const require=__cuesheetCreateRequire(import.meta.url);"}});
const external=Object.values(result.metafile.outputs).flatMap(output=>output.imports).filter(i=>i.external&&!isBuiltin(i.path));
if(external.length)throw new Error(`Terminal bundle has unresolved runtime dependencies: ${external.map(i=>i.path).join(', ')}`);
// Yoga resolves this asset relative to import.meta.url in its Node entry.
const inkRequire=createRequire(require.resolve('ink'));
copyFileSync(inkRequire.resolve('yoga-wasm-web/dist/yoga.wasm'),join(out,'yoga.wasm'));
const packages=new Map();
for(const input of Object.keys(result.metafile.inputs)){
 if(!input.includes('node_modules/'))continue;
 let dir=dirname(resolve(root,input));
 while(dir!==dirname(dir)){
  const manifest=join(dir,'package.json');
  if(existsSync(manifest)){
   const pkg=JSON.parse(readFileSync(manifest,'utf8'));const key=`${pkg.name}@${pkg.version}`;
   if(!packages.has(key)){
    const licenses=readdirSync(dir).filter(name=>/^(licen[cs]e|copying)(\..*)?$/i.test(name)&&statSync(join(dir,name)).isFile());
    packages.set(key,`${key} (${typeof pkg.license==='string'?pkg.license:'license in package metadata'})\n${licenses.map(name=>readFileSync(join(dir,name),'utf8')).join('\n')}`);
   }
   break;
  }
  dir=dirname(dir);
 }
}
writeFileSync(join(out,'THIRD-PARTY-NOTICES.txt'),[...packages.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,text])=>text).join('\n\n---\n\n')+'\n');
if(!existsSync(join(out,'main.mjs'))||!existsSync(join(out,'yoga.wasm')))throw new Error('Installed terminal artifacts are missing.');
console.error(`build: bundled terminal and Yoga asset; ${packages.size} dependency notices`);

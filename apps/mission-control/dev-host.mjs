// Local rendering proof for an actual captured MCP result. Not a production host.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const snapshot=process.argv[2];
if(!snapshot)throw new Error('Usage: node dev-host.mjs /absolute/path/mission.json');
JSON.parse(readFileSync(snapshot,'utf8'));
const bundle=await build({entryPoints:[new URL('./dev-host.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const html='<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#eee;font:13px system-ui}p{margin:12px;color:#555}iframe{display:block;width:min(100%,760px);height:850px;border:0;margin:auto;background:white}</style><p>Local read-only rendering proof. Captured real mission; not a live host connection.</p><iframe title="Cuesheet Mission Control" sandbox="allow-scripts"></iframe><script type="module" src="/host.js"></script></html>';
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Cache-Control','no-store');if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else if(path==='/host.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}else if(path==='/resource'){res.setHeader('Content-Type','text/html');res.end(readFileSync(new URL('./dist/mission-control.html',import.meta.url)));}else if(path==='/snapshot'){res.setHeader('Content-Type','application/json');res.end(readFileSync(snapshot));}else{res.statusCode=404;res.end();}});
server.listen(4319,'127.0.0.1',()=>console.log('Read-only rendering proof: http://127.0.0.1:4319'));

import { execFile } from "node:child_process";
import { inspectAgentGit } from "./agent-git.ts";

const hidden = /(^|\/)(?:\.env(?:\.|$)|\.git\/|node_modules\/|\.ssh\/|\.aws\/|secrets?\/|credentials?\/)|\.(?:pem|p12|pfx|key|keystore)$/i;
export async function trackedFileMentions(scope:string):Promise<string[]> {
  const check=await inspectAgentGit(scope);
  if(check.kind!=="repository" || check.repository!==check.workspace || !check.head) return [];
  const env={PATH:process.env.PATH??"/usr/bin:/bin",LC_ALL:"C",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null",GIT_OPTIONAL_LOCKS:"0"};
  return new Promise(resolve=>execFile("git",["-c","core.fsmonitor=false","ls-files","-z","--cached","--"],{cwd:check.workspace,env,encoding:"utf8",timeout:5000,maxBuffer:262144},(error,out)=>{
    if(error) return resolve([]);
    resolve(out.split("\0").filter(path=>path.length>0 && !hidden.test(path) && !path.includes("\\") && !path.split("/").includes("..") && !/[\x00-\x1f\x7f]/.test(path)).slice(0,5000));
  }));
}

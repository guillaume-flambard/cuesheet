/** Read-only, fail-closed comparison against the capture digest algorithm.
 * A matching observation never grants VERIFIED: mutable files may change immediately.
 */
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { digestDirectory } from "./artifact-capture.ts";
import { inspectAgentGit } from "./agent-git.ts";
import type { Event } from "../core/store.ts";

const IGNORED=new Set(["node_modules",".npm",".git",".DS_Store",".npmrc",".pypirc"]);
function excluded(s:string){return IGNORED.has(s)||s===".env"||s.startsWith(".env.");}
const MAX_FILES=3000,MAX_BYTES=64*1024*1024;
function bounded(root:string):boolean{
 let count=0,bytes=0;
 function walk(dir:string):boolean{
   for(const entry of readdirSync(dir,{withFileTypes:true})){
     if(excluded(entry.name))continue;
     const path=join(dir,entry.name);
     const st=lstatSync(path);
     if(st.isSymbolicLink()||(!st.isDirectory()&&!st.isFile()))return false;
     if(st.isDirectory()){if(!walk(path))return false;}
     else {count++;bytes+=st.size;if(count>MAX_FILES||bytes>MAX_BYTES)return false;}
   }
   return true;
 }
 return walk(root);
}
export async function currentArtifactComparison(workspace:string,events:readonly Event[]):Promise<string[]>{
 const last=[...events].reverse().find(e=>e.kind==="work_verified");
 if(!last)return ["Workspace courant : aucun reçu de vérification à comparer."];
 const target=last.data.target;
 const expected=target && typeof target==="object" ? (target as Record<string,unknown>).artifactDigest : undefined;
 if(typeof expected!=="string"||!/^[a-f0-9]{64}$/.test(expected))return ["Workspace courant : reçu sans digest exploitable."];
 try {
   const inventory=await inspectAgentGit(workspace);
   if(inventory.kind!=="repository"||inventory.repository!==inventory.workspace||inventory.workspace!==realpathSync(workspace))
     return ["Workspace courant : comparaison refusée hors racine Git attestée."];
   if(!bounded(inventory.workspace))return ["Workspace courant : inspection refusée (taille, type ou lien symbolique)."];
   const before=await inspectAgentGit(inventory.workspace);
   if(before.kind!=="repository"||before.head!==inventory.head)return ["Workspace courant : source instable, comparaison indisponible."];
   const actual=digestDirectory(inventory.workspace).digest;
   const after=await inspectAgentGit(inventory.workspace);
   if(after.kind!=="repository"||after.head!==inventory.head)return ["Workspace courant : dépôt changé pendant l'inspection."];
   return actual===expected
     ? ["Workspace courant : digest identique au reçu lors de la lecture, NON attesté comme état atomique ou validé actuellement."]
     : ["Workspace courant : DIGEST DIFFÉRENT du reçu historique — preuve périmée pour ces fichiers."];
 }catch{return ["Workspace courant : comparaison indisponible ; aucune preuve de correspondance."];}
}

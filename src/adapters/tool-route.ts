/** Owner configuration chooses an executor; corpus/model inputs cannot. */
import {statSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
export const DEFAULT_TOOL_IMAGE='node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
export const DEFAULT_CONTAINER_TOOLS=Object.freeze(['node','npm','npx','cat','ls']);
export type ToolRoute={kind:'local';reason:string}|{kind:'unavailable';reason:string}|{kind:'container';socket:string;image:string;defaultImage:boolean;reason:string};
export function chooseToolRoute(options:{home:string;enterprise:boolean;mode?:string;image?:string;socket?:string;socketAvailable?:(path:string)=>boolean}):ToolRoute{
 const mode=options.mode??'auto';if(!['auto','container','local'].includes(mode))throw new Error('Tool mode must be auto, container or local.');
 if(mode==='local')return options.enterprise?{kind:'unavailable',reason:'Contexte entreprise : outils externes indisponibles sans isolation admise.'}:{kind:'local',reason:'Route locale choisie par le propriétaire ; cwd/argv contrôlés, sans confinement OS.'};
 if(options.socket && (!isAbsolute(options.socket)||/[\0\r\n]/.test(options.socket)))throw new Error('Tool socket must be a local absolute Unix path.');
 const available=options.socketAvailable??((path:string)=>{try{return statSync(path).isSocket();}catch{return false;}});
 const candidates=options.socket?[options.socket]:[join(options.home,'.docker','run','docker.sock'),'/var/run/docker.sock'];
 const socket=candidates.find(available);
 if(socket||options.image||options.socket||mode==='container')return {kind:'container',socket:socket??candidates[0]!,image:options.image??DEFAULT_TOOL_IMAGE,defaultImage:!options.image||options.image===DEFAULT_TOOL_IMAGE,reason:socket?'Route conteneur choisie automatiquement depuis un socket local ; daemon/image vérifiés à chaque appel.':'Route conteneur déclarée ; socket/daemon/image encore à vérifier, aucun fallback local.'};
 return options.enterprise?{kind:'unavailable',reason:'Contexte entreprise : aucun socket Docker local disponible ; outils externes refusés.'}:{kind:'local',reason:'Aucun socket Docker local disponible ; route personnelle cwd/argv contrôlée, sans confinement OS.'};
}
/** Owner choices stay fixed; socket availability is reobserved at each start. */
export function createToolRouteSelector(options:Parameters<typeof chooseToolRoute>[0]):()=>ToolRoute{
 const configured=Object.freeze({...options});return ()=>chooseToolRoute(configured);
}

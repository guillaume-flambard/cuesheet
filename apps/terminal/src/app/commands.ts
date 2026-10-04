/** UI commands are local actions. Controller-owned commands retain their original parser. */
export const commandCatalog = [
 {name:'commands',description:'Search all commands',action:'palette'},
 {name:'work',description:'Inspect work, results and agents',action:'work'},
 {name:'help',description:'Keyboard and command reference',action:'help'},
 {name:'models',aliases:['model'],description:'Choose provider and model',action:'models'},
 {name:'skills',description:'Inspect installed and session skills',action:'skills'},
 {name:'agents',description:'Inspect active and preserved agents',action:'agents'},
 {name:'agent-models',description:'Choose models by worker role',action:'agent-models'},
 {name:'context',description:'Inspect shared context; edit|resolve ID REV TEXT',action:'context'},
 {name:'situation',description:'Inspect current work and constraints',action:'situation'},
 {name:'notifications',description:'Inspect and acknowledge notices',action:'notifications'},
 {name:'changes',aliases:['diff'],description:'Review, apply or set aside isolated changes',action:'changes'},
 {name:'workspaces',description:'Inspect isolated changes and integration',action:'workspaces'},
 {name:'check',description:'Review the pinned acceptance check',action:'check'},
 {name:'log',aliases:['history','inspect'],description:'Inspect the session log',action:'inspect'},
 {name:'sessions',description:'Open a preserved session',action:'sessions'},
 {name:'new',description:'Start a new session without deleting history',action:'new'},
 {name:'resume',description:'Resume the current unfinished objective',action:'resume'},
 {name:'stop',description:'Stop work and preserve its state',action:'stop'},
 {name:'steer',description:'Correct the current objective: /steer TEXT',action:'steer'},
 {name:'memory',description:'Inspect or record session memory',action:'native'},
 {name:'motion',description:'Animations: /motion on|off',action:'motion'},
 {name:'quit',description:'Exit when no work is running',action:'quit'},
] as const;
export type CommandAction=typeof commandCatalog[number]['action'];
export function findCommand(name:string){return commandCatalog.find(c=>c.name===name||('aliases' in c&&(c.aliases as readonly string[]).includes(name)));}
export function commandMatches(text:string){const name=text.replace(/^\//,'').toLowerCase();if(/\s/.test(name))return [];return commandCatalog.filter(c=>c.name.startsWith(name)||('aliases'in c&&c.aliases.some(a=>a.startsWith(name))));}
export function completeCommand(text:string):string|null{const matches=commandMatches(text);if(matches.length!==1)return null;return '/'+matches[0]!.name;}

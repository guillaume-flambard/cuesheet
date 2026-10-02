/** Controller-observed situation. Informative facts never grant permissions. */
export interface SituationInput {sessionId:string;executionId:string|null;workspace:string;launchDirectory:string;objective:{id:string;revision:number}|null;role:string;model:string;lastHuman:{sourceSeq:number;text:string}|null;peers:Array<{role:string;model:string;phase:string}>;}
export interface Situation extends SituationInput {version:1;time:{utc:string;epochMs:number;local:string;timeZone:string;offset:string;source:'host-clock'};locale:string;responseLanguage:{preference:string|null;source:'owner-config'|'conversation';rule:string};human:{label:string|null;source:'owner-config'|'unknown';role:'person directing the work'};host:{label:string|null;platform:string};authority:string;}
export function createSituation(options:{now?:()=>number;env?:NodeJS.ProcessEnv;locale?:string;timeZone?:string;platform?:string}={}):(input:SituationInput)=>Situation{
 const env={...(options.env??process.env)},now=options.now??Date.now;
 const timeZone=options.timeZone??env.CUESHEET_TIME_ZONE??Intl.DateTimeFormat().resolvedOptions().timeZone;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'});
 const locale=Intl.getCanonicalLocales(options.locale??Intl.DateTimeFormat().resolvedOptions().locale)[0]!;
 const preference=env.CUESHEET_LANGUAGE?Intl.getCanonicalLocales(env.CUESHEET_LANGUAGE)[0]!:null;
 const label=(key:string)=>{const value=env[key];if(value===undefined)return null;if(!value.trim()||value.length>128||/[\u0000-\u001f\u007f-\u009f]/.test(value))throw Error(`Invalid ${key}.`);return value.trim();};
 const human=label('CUESHEET_USER_LABEL'),host=label('CUESHEET_HOST_LABEL');
 return input=>{const epochMs=now();if(!Number.isSafeInteger(epochMs))throw Error('Invalid host clock.');const date=new Date(epochMs),parts=formatter.formatToParts(date);const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  return {...input,peers:input.peers.slice(0,6).map(p=>({...p})),lastHuman:input.lastHuman?{...input.lastHuman,text:input.lastHuman.text.slice(0,800)}:null,version:1,
   time:{utc:date.toISOString(),epochMs,local:`${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`,timeZone,offset:part('timeZoneName'),source:'host-clock'},locale,
   responseLanguage:{preference,source:preference?'owner-config':'conversation',rule:'Follow the latest explicit human language request. Otherwise use the configured preference if present, or the language of the latest human message. OS locale is not evidence of conversation language. Preserve code and identifiers.'},
   human:{label:human,source:human?'owner-config':'unknown',role:'person directing the work'},host:{label:host,platform:options.platform??process.platform},authority:'Controller-observed runtime context; no extra permissions, no completion evidence. Historical dates are not the current date.'};
 };
}

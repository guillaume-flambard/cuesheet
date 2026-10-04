import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
export const MotionContext=createContext(process.env.CUESHEET_REDUCE_MOTION!=='1');
export const useMotion=()=>useContext(MotionContext);
/** A bounded visual pulse. Mounting restored history does not animate old transitions. */
export function useMotionPulse(identity:string,spawn=false):number {
 const enabled=useMotion();const prior=useRef(identity);const mounted=useRef(false);const [progress,setProgress]=useState(spawn?0:1);
 useEffect(()=>{
  const changed=prior.current!==identity || (!mounted.current&&spawn);prior.current=identity;mounted.current=true;
  if(!enabled||!changed){setProgress(1);return;}
  const started=Date.now();setProgress(0);const timer=setInterval(()=>{const t=Math.min(1,(Date.now()-started)/240);setProgress(1-Math.pow(1-t,3));if(t===1)clearInterval(timer);},40);
  return ()=>clearInterval(timer);
 },[identity,enabled]);
 return enabled?progress:1;
}

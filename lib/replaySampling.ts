/** Sample before ingestion. Stable in a tab; storage failures fail closed. */
export function replaySessionSample(storage: Pick<Storage,'getItem'|'setItem'>, rate=0.1, random=Math.random){
 if(!Number.isFinite(rate)||rate<=0)return false;
 try{
  const key='n2t:replay-sample:v1';
  const saved=storage.getItem(key);
  let draw=saved===null ? NaN : Number(saved);
  if(!Number.isFinite(draw)||draw<0||draw>=1){draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)return false;storage.setItem(key,String(draw));}
  return draw<Math.min(rate,1);
 }catch{return false;}
}

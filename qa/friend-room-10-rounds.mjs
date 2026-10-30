import { createSandbox,startServer,stopServer,makeUser,freePort } from './lib/env.mjs';
const VERSION='114';
const results=[];
function user(round,i,mode){return makeUser({username:`r${round}_${mode}_${i}`,name:`R${round}${mode}${i}`,chips:5000,tokens:[{token:`r${round}${mode}${i}`,at:Date.now()}]});}
async function runRound(round,mode){
 const users=[];for(let i=0;i<9;i++)users.push(user(round,i,mode));const sb=createSandbox({users,label:`r10-${round}-${mode}`});const port=await freePort();const server=await startServer(sb,{port,env:{TURN_MS:'1500',NEXT_HAND_MS:'600'}});const base=`http://127.0.0.1:${port}`;const h={'Content-Type':'application/json','X-Client-Version':VERSION};async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:h,body:JSON.stringify(body)});let d=null;try{d=await r.json()}catch{};return {s:r.status,d}};const streams=[];async function sse(code,token){const r=await fetch(`${base}/api/rooms/${code}/events?token=${token}&v=${VERSION}`);const reader=r.body.getReader();const dec=new TextDecoder();const chunks=[];(async()=>{try{while(true){const {value,done}=await reader.read();if(done)break;chunks.push(dec.decode(value))}}catch{}})();streams.push(r);return chunks}
 const pidToken=new Map();
 try{
  let code;
  if(mode==='friend'){
   const cr=await post('/api/rooms',{token:`r${round}${mode}0`,name:`十轮好友${round}`,password:'123',seats:8,startingChips:5000,sb:1,bb:2});
   if(!cr.d?.code)throw new Error('create '+JSON.stringify(cr));code=cr.d.code;pidToken.set(cr.d.pid,cr.d.token);
   for(let i=1;i<5;i++){const j=await post(`/api/rooms/${code}/join`,{token:`r${round}${mode}${i}`,password:'123'});if(!j.d?.token)throw new Error('join '+i+' '+JSON.stringify(j));pidToken.set(j.d.pid,j.d.token)}
  }else{
   let cr=null;for(let i=0;i<5;i++){const j=await post('/api/match/quick',{token:`r${round}${mode}${i}`});if(!j.d?.code)throw new Error('match quick '+JSON.stringify(j));cr=j;}
   code=cr.d.code;
   // fetch existing room membership via match/quick responses for players; reopen each to get pid/token via match/quick same code? use match/join not idempotent? Use first response from each was overwritten. Re-run quick for each to get existing.
   for(let i=0;i<5;i++){const j=await post('/api/match/quick',{token:`r${round}${mode}${i}`});if(j.d?.token)pidToken.set(j.d.pid,j.d.token);}
  }
  const tokens=[...pidToken.values()];const chunksList=[];for(const t of tokens)chunksList.push(await sse(code,t));
  await new Promise(r=>setTimeout(r,250));
  if(mode==='friend'){const st=await post(`/api/rooms/${code}/start`,{token:tokens[0]});if(st.s!==200)throw new Error('start '+JSON.stringify(st));}
  else {for(const t of tokens){const r=await post(`/api/rooms/${code}/action`,{token:t,action:'ready',ready:true});if(r.s!==200)throw new Error('ready '+JSON.stringify(r));}}
  await new Promise(r=>setTimeout(r,250));
  const sixthToken=`r${round}${mode}5`;
  const join= mode==='friend'
    ? await post(`/api/rooms/${code}/join`,{token:sixthToken,password:'123'})
    : await post('/api/match/join',{token:sixthToken,code});
  if(join.s!==200)throw new Error('sixth join '+JSON.stringify(join));
  if(join.d?.spectator) throw new Error('sixth marked spectator');
  if(join.d?.token){pidToken.set(join.d.pid,join.d.token);await sse(code,join.d.token)}
  const allText=()=>chunksList.map(c=>c.join('')).join('\n');
  const states=()=>[...allText().matchAll(/event: state\ndata: (.+)/g)].map(m=>{try{return JSON.parse(m[1])}catch{return null}}).filter(Boolean);
  // fold through current hand
  let before=states().at(-1);
  for(let step=0;step<20;step++){
   const st=states().at(-1);if(!st)break;if(st.phase==='settle')break;
   const turn=st.turn;if(!turn){await new Promise(r=>setTimeout(r,120));continue;}
   const player=st.seats?.find(s=>s.seat===turn.seat);const tok=pidToken.get(player?.pid);if(!tok)break;
   await post(`/api/rooms/${code}/action`,{token:tok,action:{type:'fold'}});await new Promise(r=>setTimeout(r,120));
  }
  await new Promise(r=>setTimeout(r,1800));
  const after=states().at(-1);
  const waitingPid=join.d?.pid;
  const waitingSeated=Boolean(after?.seats?.some(s=>s.pid===waitingPid));
  return {round,mode,ok:Boolean(waitingSeated),code,joinWaiting:Boolean(join.d?.waiting),joinSpectator:Boolean(join.d?.spectator),seatsBefore:before?.seats?.length,seatsAfter:after?.seats?.length,waitingSeated,phase:after?.phase,error:null};
 }catch(error){return {round,mode,ok:false,code:null,error:String(error.message||error)}}
 finally{await stopServer(server)}
}
for(let r=1;r<=10;r++){const mode=r<=5?'friend':'match';const res=await runRound(r,mode);results.push(res);console.log(JSON.stringify(res));}
console.log('SUMMARY',JSON.stringify({total:results.length,pass:results.filter(r=>r.ok).length,fail:results.filter(r=>!r.ok).length,results},null,2));


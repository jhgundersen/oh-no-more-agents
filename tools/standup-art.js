#!/usr/bin/env node
// Actual-size standup evidence and bounded host checks: one local browser,
// five seeded completions per view, deterministic wall time between captures.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {serve,browser} from './phone.js'
export const STANDUP_VIEWS=[
 {name:'desktop',width:1280,height:900,mobile:false,index:0},
 {name:'phone',width:390,height:844,mobile:true,index:2},
 {name:'small-phone',width:360,height:800,mobile:true,index:4},
 {name:'landscape',width:844,height:390,mobile:true,index:1},
 {name:'nord-reduced',width:390,height:844,mobile:true,index:0,theme:'nord',reduced:true},
 {name:'one-speaker',width:390,height:844,mobile:true,index:0,count:1}
]
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function evaluator(b){return async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}}
async function waitFor(ev,expression){
 for(let i=0;i<100;i++){if(await ev(expression))return;await sleep(20)}
 throw Error('Standup wait exceeded 100 polls: '+expression+'; '+JSON.stringify(await ev('({level:window.AgentWorld?.()?.level,t:window.standupArt?.t,pause:document.getElementById("pauseWord")?.textContent})')))
}
async function prepare(b,ev,base,v){
 await b.cmd('Emulation.setDeviceMetricsOverride',{width:v.width,height:v.height,deviceScaleFactor:1,mobile:v.mobile})
 await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:v.mobile})
 await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:v.reduced?'reduce':'no-preference'}]})
 await b.cmd('Page.navigate',{url:base+'/?level=1&seed=3'})
 await waitFor(ev,'window.AgentWorld?.()?.level===1&&!AgentWorld().done')
 await ev('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1000))])')
 await ev(`(()=>{
 document.getElementById('c-pause').click();for(let i=0;i<3&&document.getElementById('speedWord').textContent!=='Brisk';i++)document.getElementById('speed').click();
 [...document.querySelectorAll('#themes button')].find(b=>b.textContent===${JSON.stringify(v.theme||'tokyo-night')}).click();
 const style=document.createElement('style');style.textContent='#stage *,#stage *::before,#stage *::after{transition:none!important;animation:none!important}';document.head.appendChild(style);
 const gen=generate;generate=function(level,attempt,seed){return gen(level,attempt,seed===undefined?3:seed)};
 window.standupArtTime=100000;performance.now=()=>window.standupArtTime;window.standupArt=null;window.standupCues=[];
 const original=drawStandup,panel=drawGagPanel,text=drawTransitionText,cue=AgentSfx.cue;
 drawStandup=function(ctx,w,p,s){window.standupArt={t:s.t,speakers:s.speakers,panels:[],text:[]};return original(ctx,w,p,s)};
 drawGagPanel=function(ctx,x,y,width,height,edge,paper){if(window.standupArt&&paper===GAG_PAPER)standupArt.panels.push({x,y,width,height});return panel(ctx,x,y,width,height,edge,paper)};
 drawTransitionText=function(ctx,str,x,y,size){if(window.standupArt&&(/^(YESTERDAY:|TODAY:|BLOCKERS:|AGENT |DAILY STANDUP|TAP OR CLICK)/.test(str)))standupArt.text.push({str,x,y,size});return text(ctx,str,x,y,size)};
 AgentSfx.cue=function(kind){if(kind==='murmur')standupCues.push(standupArtTime);return cue(kind)};
 // Pin the copy, not the simulation, for identical before/after specimens.
 const lines=standupLines({agiLost:1,hallucinations:1,ducked:1,rateLimited:1,hazardKills:99},5);standupLines=()=>lines;
 })()`)
 for(let i=0;i<5;i++){
  await ev(`(()=>{const w=AgentWorld();for(let j=0;j<400&&!w.done;j++)step(w);w.agents.forEach(a=>{a.state='saved';a.gone=false});if(${i===4&&v.count===1})w.agents=w.agents.slice(0,1);Object.assign(w,{done:true,doneTicks:111,moments:[],saved:w.agents.length,released:w.toRelease});document.getElementById('c-pause').click()})()`)
  await waitFor(ev,i<4?'AgentWorld().level==='+String(i+2):'!!window.standupArt')
  if(i<4)await ev("document.getElementById('c-pause').click()")
 }
 await ev("document.getElementById('tip').hidden=true;scrollTo(0,0)")
}
async function at(ev,t){await ev('window.standupArtTime=100000+'+t+'*30');await waitFor(ev,'window.standupArt?.t==='+t)}
async function record(ev){return ev(`(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}},s=standupArt;
 return{...s,talking:typeof standupSpeaker==='function'?standupSpeaker(s.t,2):Math.floor((s.t-STANDUP_INTRO)/STANDUP_TURN),turn:typeof standupTurn==='function'?standupTurn(2):STANDUP_TURN,
 board:rect(document.getElementById('board')),stage:rect(document.getElementById('stage')),viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,reduced:AgentWorld().reducedMotion}
 })()`)}
async function lifecycle(b,ev,base){
 const v=STANDUP_VIEWS.at(-1);await prepare(b,ev,base,v)
 const turn=await ev("typeof standupTurn==='function'?standupTurn(2):STANDUP_TURN"),end=12+turn,before=await ev('JSON.stringify(AgentWorld())')
 await at(ev,11);const intro=(await record(ev)).panels.length===0
 await at(ev,12);const first=(await record(ev)).talking
 await at(ev,end-1);const last=(await record(ev)).talking
 const speed=[]
 for(let i=0;i<3;i++){await ev("document.getElementById('speed').click()");await sleep(55);speed.push((await record(ev)).talking)}
 const readOnly=before===await ev('JSON.stringify(AgentWorld())'),cuesBefore=await ev('standupCues.length')
 await ev('standupArtTime=100000+'+end+'*30');await waitFor(ev,'AgentWorld().level===6&&!AgentWorld().done')
 const ended=await ev('AgentWorld().level'),cuesAfter=await ev('standupCues.length')
 await prepare(b,ev,base,v);await at(ev,20)
 const p=await ev("(()=>{const r=document.getElementById('board').getBoundingClientRect();return{x:Math.max(0,r.x)+30,y:r.y+40}})()")
 for(const type of['mousePressed','mouseReleased'])await b.cmd('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1})
 const tapped=await ev('AgentWorld().level===6&&!AgentWorld().done')
 return{turn,intro,first,last,speed,readOnly,cuesBefore,cuesAfter,ended,tapped}
}
async function sheet(ev,out,before,records){
 const rows=records.map(r=>({name:r.name,width:r.clip.width,height:r.clip.height,png:[before,out].map(d=>fs.readFileSync(path.join(d,r.name+'-board.png')).toString('base64'))}))
 const phones=['phone','small-phone'].map(name=>({name,png:[before,out].map(d=>fs.readFileSync(path.join(d,name+'.png')).toString('base64'))}))
 const png=await ev(`(async()=>{
 const rows=${JSON.stringify(rows)},phones=${JSON.stringify(phones)},c=document.createElement('canvas');c.width=1680;c.height=70+rows.reduce((n,r)=>n+r.height+40,0)+1740;
 const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#1a1b26';ctx.fillRect(0,0,c.width,c.height);ctx.font='14px monospace';ctx.fillStyle='#f4f4ec';ctx.fillText('READABLE STANDUP · BEFORE / AFTER · actual CSS sizes',20,25);
 const image=async src=>{const i=new Image();i.src='data:image/png;base64,'+src;await i.decode();return i};let y=50;
 for(const r of rows){ctx.fillText(r.name.toUpperCase()+' · BEFORE',20,y);ctx.fillText('AFTER',860,y);y+=14;for(let j=0;j<2;j++)ctx.drawImage(await image(r.png[j]),20+j*840,y,r.width,r.height);y+=r.height+26}
 for(const r of phones){ctx.fillText(r.name.toUpperCase()+' · FULL PAGE',20,y);y+=14;for(let j=0;j<2;j++)ctx.drawImage(await image(r.png[j]),20+j*840,y);y+=850}
 return c.toDataURL().split(',')[1]
 })()`);fs.writeFileSync(path.join(out,'contact-sheet.png'),Buffer.from(png,'base64'))
}
export async function captureStandups(out,{root,before,checks=false}={}){
 fs.mkdirSync(out,{recursive:true});const server=await serve({root}),b=await browser(),ev=evaluator(b),records=[]
 try{
  const base='http://127.0.0.1:'+server.address().port
  for(const v of STANDUP_VIEWS){
   await prepare(b,ev,base,v);const turn=await ev("typeof standupTurn==='function'?standupTurn(2):STANDUP_TURN");await at(ev,12+turn*v.index+8)
   const r=await record(ev),shot=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,v.name+'.png'),Buffer.from(shot.data,'base64'))
   const q=r.board,clip={x:Math.max(0,q.x),y:Math.max(0,q.y),width:Math.min(q.x+q.width,v.width)-Math.max(0,q.x),height:Math.min(q.y+q.height,v.height)-Math.max(0,q.y),scale:1};
   const board=await b.cmd('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false});fs.writeFileSync(path.join(out,v.name+'-board.png'),Buffer.from(board.data,'base64'));records.push({...v,...r,clip})
  }
  const result={records,lifecycle:checks?await lifecycle(b,ev,base):null,errors:b.errors};if(before)await sheet(ev,out,before,records)
  fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2));return result
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2).filter(a=>a!=='--checks');captureStandups(args[0]||'shots/standup-art',{root:args[1],before:args[2],checks:process.argv.includes('--checks')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1})
}

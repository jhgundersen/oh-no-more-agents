#!/usr/bin/env node
// Native-size report evidence: one browser, bounded seeded runs and fixtures.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {serve,browser} from './phone.js'
export const REPORT_VIEWS=[
 {name:'desktop',level:8,width:1280,height:900,mobile:false,kind:'natural'},
 {name:'phone',level:8,width:390,height:844,mobile:true,kind:'natural'},
 {name:'full-house',level:18,width:390,height:844,mobile:true,kind:'busy'},
 {name:'small-phone',level:18,width:360,height:800,mobile:true,kind:'busy',season:'halloween'},
 {name:'christmas',level:13,width:390,height:844,mobile:true,kind:'all',season:'christmas'},
 {name:'landscape-zero',level:20,width:844,height:390,mobile:true,kind:'zero'}
]
export function setupReport(w,kind){
 w.done=true;w.doneTicks=20;w.doneHold=150
 if(kind==='zero'){w.saved=0;w.toRelease=18;w.lost=18}
 if(kind==='all'){w.saved=18;w.toRelease=18;w.lost=0}
 if(kind==='busy'){
  Object.assign(w,{saved:12,toRelease:18,lost:6,escortsHome:3,enemiesKilled:4,umbrellaSaves:3,brollyLandings:9,provisioned:4,agiHome:true,
   bet:1,betTally:{right:7,total:12},homeOrder:[1,2],daily:'2026-10-15',
   sightings:{seen:['agi','dreamer','queue','duck','conflict','outage','milestone'],fresh:['queue']}})
  w.mission={kind:'civilian',done:true,verb:'FREE THE COLLEAGUES',targets:[0,1,2].map(variant=>({home:true,variant}))}
  w.agents[0]={id:1,downed:3,saves:2,gone:true,state:'saved',x:10,y:20,dir:1}
 }
 return w
}
function evaluator(b){return async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function prepare(b,ev,base,v,paused){
 await b.cmd('Emulation.setDeviceMetricsOverride',{width:v.width,height:v.height,deviceScaleFactor:1,mobile:v.mobile})
 await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:v.mobile})
 await b.cmd('Page.navigate',{url:base+'/?level='+v.level+'&seed=3'+(v.season?'&season='+v.season:'')})
 let ready=false;for(let i=0;i<80;i++){if(await ev('window.AgentWorld?.()?.level==='+v.level+'&&!AgentWorld().done')){ready=true;break}await sleep(40)}if(!ready)throw Error('Report page did not start within 3.2 seconds')
 await ev('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1000))])')
 return ev(`(()=>{
 document.getElementById('c-pause').click();const w=AgentWorld(),random=Math.random;let seed=317;
 try{Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<10000&&!w.done;i++)step(w);
 }finally{Math.random=random}
 if(!w.done)throw Error('Report run exceeded 10000 ticks');
 (${setupReport.toString()})(w,${JSON.stringify(v.kind)});
 if(${v.kind==='natural'}){const seen=sightingsIn(w);w.sightings={seen,fresh:seen}}
 document.getElementById('who').click();document.getElementById('who').click();
 if(!${paused})document.getElementById('overlay').style.visibility='hidden';document.getElementById('tip').hidden=true;scrollTo(0,0);
 const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}};
 return{level:w.level,saved:w.saved,total:w.toRelease,ticks:w.ticks,title:homeTitle(w),verdict:levelVerdict(w),sourceRows:reportRows(w,{}),
  pauseVisible:getComputedStyle(document.getElementById('overlay')).display!=='none'&&getComputedStyle(document.getElementById('overlay')).visibility!=='hidden',
  caption:{...r(document.getElementById('eventCaption')),text:document.getElementById('eventText').textContent,textBox:r(document.getElementById('eventText')),hidden:document.getElementById('eventCaption').getAttribute('aria-hidden')},
  layout:typeof pageReportLayout==='function'?pageReportLayout(w,{}):null,board:r(document.getElementById('board')),stage:r(document.getElementById('stage')),viewport:innerWidth,pageWidth:document.documentElement.scrollWidth}
 })()`)
}
export async function captureReports(out,{root,before,paused=false}={}){
 fs.mkdirSync(out,{recursive:true});const server=await serve({root}),b=await browser(),ev=evaluator(b),records=[]
 try{
  for(const v of REPORT_VIEWS){
   const r=await prepare(b,ev,'http://127.0.0.1:'+server.address().port,v,paused)
   const page=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,v.name+'.png'),Buffer.from(page.data,'base64'))
   const q=r.board,clip={x:Math.max(0,q.x),y:Math.max(0,q.y),width:Math.min(q.x+q.width,v.width)-Math.max(0,q.x),height:Math.min(q.y+q.height,v.height)-Math.max(0,q.y),scale:1},board=await b.cmd('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false});fs.writeFileSync(path.join(out,v.name+'-board.png'),Buffer.from(board.data,'base64'))
   records.push({name:v.name,width:v.width,height:v.height,clip,...r})
  }
  if(before)await sheet(ev,out,before,records,paused)
  const report={records,errors:b.errors};fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(report,null,2));return report
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
async function sheet(ev,out,before,records,paused){
 const rows=records.map(r=>({name:r.name,width:r.clip.width,height:r.clip.height,png:[before,out].map(d=>'data:image/png;base64,'+fs.readFileSync(path.join(d,r.name+'-board.png')).toString('base64'))}))
 const pages=['phone','small-phone'].map(name=>({name,png:[before,out].map(d=>'data:image/png;base64,'+fs.readFileSync(path.join(d,name+'.png')).toString('base64'))}))
 const result=await ev(`(async()=>{
 const rows=${JSON.stringify(rows)},pages=${JSON.stringify(pages)},c=document.createElement('canvas');c.width=1680;c.height=rows.reduce((n,r)=>n+r.height+42,60)+1700;
 const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle='#1a1b26';x.fillRect(0,0,c.width,c.height);x.font='14px monospace';x.fillStyle='#f3ead9';x.fillText('${paused?'HELD REPORTS':'REPORT TYPOGRAPHY'} · BEFORE / AFTER · native CSS sizes · seed 3',20,25);
 const image=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src});let y=50;
 for(const r of rows){x.fillText(r.name.toUpperCase()+' · BEFORE',20,y);x.fillText('AFTER',860,y);y+=14;for(let j=0;j<2;j++)x.drawImage(await image(r.png[j]),20+840*j,y,r.width,r.height);y+=r.height+28}
 for(const r of pages){x.fillText(r.name.toUpperCase()+' · PAGE CONTEXT',20,y);y+=14;for(let j=0;j<2;j++)x.drawImage(await image(r.png[j]),20+840*j,y);y+=850}
 return c.toDataURL().split(',')[1]
 })()`)
 fs.writeFileSync(path.join(out,'contact-sheet.png'),Buffer.from(result,'base64'))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2).filter(a=>a!=='--paused')
 captureReports(args[0]||'shots/reports',{root:args[1],before:args[2],paused:process.argv.includes('--paused')})
  .then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1})
}

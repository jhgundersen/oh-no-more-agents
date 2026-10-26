#!/usr/bin/env node
// Real-size inventory evidence and passive-readout checks, in one local browser.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {serve,browser} from './phone.js'
export const STOCK_VIEWS=[
 {name:'desktop',width:1280,height:900,mobile:false,dpr:1},
 {name:'phone',width:390,height:844,mobile:true,dpr:1},
 {name:'phone-dpr2',width:390,height:844,mobile:true,dpr:2},
 {name:'landscape',width:844,height:390,mobile:true,dpr:1},
 {name:'narrow',width:650,height:850,mobile:false,dpr:1},
 {name:'christmas',width:390,height:844,mobile:true,dpr:1,season:'christmas'}
]
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function evaluator(b){return async expression=>{
 const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
 if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails))
 return r.result.value
}}
async function open(b,ev,base,v){
 await b.cmd('Emulation.setDeviceMetricsOverride',{width:v.width,height:v.height,deviceScaleFactor:v.dpr,mobile:v.mobile})
 await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:v.mobile})
 await b.cmd('Page.navigate',{url:base+'/?level=16&seed=3'+(v.season?'&season='+v.season:'')})
 let ready=false
 for(let i=0;i<80;i++){if(await ev('window.AgentWorld?.()?.level===16')){ready=true;break}await sleep(40)}
 if(!ready)throw Error('Inventory page did not become ready within 3.2 seconds')
 await ev('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1000))])')
}
const READ=`(()=>{
 document.getElementById('c-pause').click();const w=AgentWorld();
 for(let i=0;i<400&&w.ticks<400&&!w.done;i++)step(w);
 document.getElementById('who').click();document.getElementById('who').click();
 document.getElementById('overlay').style.visibility='hidden';document.getElementById('tip').hidden=true;document.getElementById('levelTitle').hidden=true;scrollTo(0,0);
 // The resting layout: a count that just dropped starts the card's squash (LOG 427), a transform mid-flight.
 for(const cell of document.querySelectorAll('#toolbar .skill'))cell.classList.remove('squash');
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}},toolbar=document.getElementById('toolbar');
 return{width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,toolbar:rect(toolbar),stage:rect(document.getElementById('stage')),
  tiles:[...toolbar.children].map((cell,i)=>{const icon=cell.querySelector('canvas'),count=cell.querySelector('.skill-count');return{
   name:SKILL_ORDER[i],label:cell.querySelector('.skill-name').textContent,count:count.textContent,want:w.skills[SKILL_ORDER[i]]||0,
   box:rect(cell),countBox:rect(count),tag:cell.tagName,tab:cell.tabIndex,
   icon:icon&&{...rect(icon),widthPixels:icon.width,heightPixels:icon.height,hidden:icon.getAttribute('aria-hidden'),rendering:getComputedStyle(icon).imageRendering,png:icon.toDataURL()}
  }})}
})()`
async function cachedChecks(ev){
 return ev(`(()=>{
  const w=AgentWorld(),tiles=[...document.querySelectorAll('#toolbar .skill')],icons=tiles.map(t=>t.querySelector('canvas')),
   old=drawSkillIcon,first=icons.map(c=>c.toDataURL()),refresh=()=>{document.getElementById('speed').click();document.getElementById('speed').click();document.getElementById('speed').click()};
  let paints=0;drawSkillIcon=function(...args){paints++;return old(...args)};
  try{
   const before=JSON.stringify(w);for(let i=0;i<5;i++)refresh();const pure=before===JSON.stringify(w);
   for(const button of document.querySelectorAll('#themes .theme'))button.click();
   const stable=icons.every((c,i)=>c.toDataURL()===first[i]);
   const count=w.skills.floater,used=w.lastUsed.floater;
   w.skills.floater=0;w.lastUsed.floater=w.ticks;refresh();
   const fresh={recent:tiles[1].classList.contains('recent'),spent:tiles[1].classList.contains('spent'),count:tiles[1].querySelector('.skill-count').textContent,opacity:getComputedStyle(icons[1]).opacity};
   w.lastUsed.floater=w.ticks-21;refresh();
   const exhausted={recent:tiles[1].classList.contains('recent'),spent:tiles[1].classList.contains('spent'),count:tiles[1].querySelector('.skill-count').textContent,opacity:getComputedStyle(icons[1]).opacity};
   w.skills.floater=count;if(used===undefined)delete w.lastUsed.floater;else w.lastUsed.floater=used;refresh();
   document.getElementById('c-next').click();const current=[...document.querySelectorAll('#toolbar canvas')],reused=icons.every((c,i)=>current[i]===c);
   return{paints,pure,stable,reused,fresh,exhausted}
  }finally{drawSkillIcon=old}
 })()`)
}
export async function captureStock(out,{root,checks=false,before}={}){
 fs.mkdirSync(out,{recursive:true});const server=await serve({root}),b=await browser(),ev=evaluator(b),records=[]
 try{
  const base='http://127.0.0.1:'+server.address().port
  for(const v of STOCK_VIEWS){
   await open(b,ev,base,v);const r=await ev(READ)
   const shot=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
   fs.writeFileSync(path.join(out,v.name+'.png'),Buffer.from(shot.data,'base64'))
   const t=r.toolbar,strip=await b.cmd('Page.captureScreenshot',{format:'png',clip:{x:t.x,y:t.y,width:t.width,height:t.height,scale:1},captureBeyondViewport:true})
   fs.writeFileSync(path.join(out,v.name+'-stock.png'),Buffer.from(strip.data,'base64'));records.push({name:v.name,dpr:v.dpr,...r})
  }
  const report={records,errors:b.errors,cache:checks?await cachedChecks(ev):null}
  if(before)await sheet(ev,out,before,records)
  fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(report,null,2));return report
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
async function sheet(ev,out,before,records){
 const data=STOCK_VIEWS.map(v=>({name:v.name,record:records.find(r=>r.name===v.name),png:[before,out].map(dir=>'data:image/png;base64,'+fs.readFileSync(path.join(dir,v.name+'-stock.png')).toString('base64'))}))
 const pages=['phone','desktop'].map(name=>({name,png:[before,out].map(dir=>'data:image/png;base64,'+fs.readFileSync(path.join(dir,name+'.png')).toString('base64'))}))
 const png=await ev(`(async()=>{
  const rows=${JSON.stringify(data)},c=document.createElement('canvas');c.width=1680;c.height=Math.ceil(1554+rows.reduce((n,r)=>n+r.record.toolbar.height+42,0));const x=c.getContext('2d');x.imageSmoothingEnabled=false;
  x.fillStyle='#1a1b26';x.fillRect(0,0,c.width,c.height);x.font='14px monospace';x.fillStyle='#f3ead9';
  const image=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src});
  x.fillText('SKILL STOCK · BEFORE / AFTER · native CSS sizes · seed 3 / tick 400',20,25);let y=55;
  for(const row of rows){
   x.fillStyle='#f3ead9';x.fillText(row.name.toUpperCase()+' · BEFORE',20,y);x.fillText('AFTER',860,y);y+=14;
   for(let j=0;j<2;j++){const im=await image(row.png[j]);x.drawImage(im,20+j*840,y,row.record.toolbar.width,row.record.toolbar.height)}
   y+=row.record.toolbar.height+28;
  }
  x.fillText('ICONS · 16px + 3× · same palette as the tour',20,y);y+=16;
  for(let i=0;i<${JSON.stringify(records[0].tiles)}.length;i++){
   const tile=${JSON.stringify(records[0].tiles)}[i],im=await image(tile.icon.png),xx=20+i*200;
   x.fillText(tile.label,xx,y+12);x.drawImage(im,xx,y+24,16,16);x.drawImage(im,xx+28,y+24,48,48)
  }y+=100;
  for(const row of ${JSON.stringify(pages)}){
   x.fillText(row.name.toUpperCase()+' · PAGE CONTEXT',20,y);y+=14;
   for(let j=0;j<2;j++){const im=await image(row.png[j]),scale=row.name==='desktop' ? 0.5 : 1;x.drawImage(im,20+j*840,y,im.width*scale,im.height*scale)}
   y+=row.name==='desktop'?480:875;
  }
  return c.toDataURL().split(',')[1]
 })()`)
 fs.writeFileSync(path.join(out,'contact-sheet.png'),Buffer.from(png,'base64'))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2).filter(a=>a!=='--checks')
 captureStock(args[0]||'shots/skill-icons',{root:args[1],before:args[2],checks:process.argv.includes('--checks')})
  .then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1})
}

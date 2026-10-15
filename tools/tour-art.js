#!/usr/bin/env node
// Screenshot the live UI once per pointer size; reuse those canvases for a
// labelled real-size/3x review sheet. No per-icon browser sessions or renders.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {serve,browser} from './phone.js'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
export async function captureUi(out,root=path.join(ROOT,'public')) {
 fs.mkdirSync(out,{recursive:true})
 const server=await serve({root}),b=await browser(),records=[]
 const ev=async expression=>{
  const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text)
  return r.result.value
 }
 try{
  for(const mobile of[false,true]){
   const width=mobile?390:1280,height=mobile?844:900
   await b.cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile})
   await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile})
   await b.cmd('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?level=20&seed=3`})
   let ready=false
   for(let i=0;i<60;i++){if(await ev('document.querySelectorAll("#tour canvas").length===20 && typeof AgentWorld==="function" && !!AgentWorld()')){ready=true;break}await sleep(50)}
   if(!ready)throw Error('UI did not become ready in 3 seconds')
   await ev('if(!AgentWorld().paused) document.getElementById("c-pause").click()')
   await ev('Promise.race([document.fonts.ready.then(()=>true),new Promise(r=>setTimeout(()=>r(false),1000))])')
   await ev('(()=>{const w=AgentWorld();for(let i=0;i<400&&!w.done&&w.ticks<400;i++)step(w);document.querySelector("#themes .theme.on").click()})()')
   const data=await ev(`(()=>{
    const tour=document.getElementById('tour'),daily=document.getElementById('daily'),board=document.getElementById('terrain')||document.querySelector('#stage canvas')
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}
    return{mobile,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,tour:rect(tour),daily:rect(daily),dailyText:daily.textContent,board:rect(board),
     icons:[...tour.children].map(b=>({name:b.title,button:rect(b),canvas:rect(b.firstChild),png:b.firstChild.toDataURL()})),
     badge:document.getElementById('dailyBadge')?.toDataURL()||null}
   })()`.replace('return{mobile,','return{mobile:'+mobile+','))
   const shot=await b.cmd('Page.captureScreenshot',{format:'png'})
   fs.writeFileSync(path.join(out,mobile?'page-phone.png':'page-desktop.png'),Buffer.from(shot.data,'base64'))
   await ev('document.getElementById("tour").scrollIntoView({block:"center"})')
   const context=await b.cmd('Page.captureScreenshot',{format:'png'})
   fs.writeFileSync(path.join(out,mobile?'ui-context-phone.png':'ui-context-desktop.png'),Buffer.from(context.data,'base64'))
   records.push(data)
  }
  // Capture the real report-card drawing with collected/missing/new sightings.
  const reports=await ev(`(()=>{
   const w=AgentWorld(),pal=build({background:hex('#1a1b26'),foreground:hex('#c0caf5'),accent:hex('#7aa2f7'),urgent:hex('#f7768e'),muted:hex('#565f89')},20)
   const rows=[]
   for(const phone of[false]){
    const c=document.createElement('canvas');c.width=800;c.height=496
    const context=c.getContext('2d');context.setTransform(2,0,0,2,0,0)
    w.doneTicks=15;w.saved=12;w.daily='2026-10-15';w.sightings={seen:['agi','dreamer','queue','duck','conflict','outage','milestone'],fresh:['duck']}
    drawLevelResults(context,w,pal)
    rows.push(c.toDataURL())
   }
   const strip=document.createElement('canvas');strip.width=260;strip.height=24
   strip.getContext('2d').setTransform(2,0,0,2,0,0);drawSightings(strip.getContext('2d'),w,pal,65,3)
   return {cards:rows,strip:strip.toDataURL()}
  })()`)
  await b.cmd('Emulation.setDeviceMetricsOverride',{width:1080,height:1500,deviceScaleFactor:1,mobile:false})
  await ev(`(()=>{
   const records=${JSON.stringify(records)},reports=${JSON.stringify(reports)}
   const style=document.createElement('style');style.textContent='body{margin:0;background:#202232;color:#f3ead9;font:11px monospace;display:block;padding:20px;box-sizing:border-box}#review{width:1040px}h1{font:16px monospace;margin:0 0 8px}h2{font:13px monospace;margin:18px 0 10px}.icons{display:grid;grid-template-columns:repeat(5,1fr);gap:12px 8px}.icon{height:110px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid #45485b}.icon p{margin:0;width:100%;height:14px}.icon img,.badge img,.report img{image-rendering:pixelated}.plate{background:#292b3d;border:1px solid #45485b;padding:2px;display:flex;align-items:center;justify-content:center}.badge{display:flex;align-items:center;gap:15px;margin-top:12px}.report{display:flex;align-items:center;gap:16px;overflow:hidden}';document.head.append(style)
   const host=document.createElement('main');host.id='review';host.innerHTML='<h1>BIOME TOUR · REAL CSS SIZE + 3×</h1><p>Each row: original canvas at its measured page size, then nearest-neighbour 3×.</p>'
   for(const record of records){
    const title=document.createElement('h2');title.textContent=record.mobile?'PHONE · 390px · 36×24 icon · 44px target':'DESKTOP · 1280px · 24×16 icon';host.append(title)
    const grid=document.createElement('div');grid.className='icons'
    for(const icon of record.icons){const cell=document.createElement('div');cell.className='icon';const text=document.createElement('p');text.textContent=icon.name;cell.append(text)
     for(const scale of[1,3]){const plate=document.createElement('div');plate.className='plate';const image=new Image();image.src=icon.png;image.width=icon.canvas.width*scale;image.height=icon.canvas.height*scale;plate.append(image);cell.append(plate)}grid.append(cell)}host.append(grid)
   }
   const badge=document.createElement('div');badge.className='badge';badge.append('COLONY OF THE DAY · 16×16 + 3×')
   if(records[0].badge)for(const scale of[1,3]){const image=new Image();image.src=records[0].badge;image.width=image.height=16*scale;badge.append(image)}host.append(badge)
   const title=document.createElement('h2');title.textContent='REPORT CARD · desktop width 800 / phone width '+records[1].board.width.toFixed(0);host.append(title)
   const card=document.createElement('div');card.className='report'
   const image=new Image();image.src=reports.cards[0];image.width=800;image.height=496;card.append(image);host.append(card)
   const sub=document.createElement('h2');sub.textContent='SIGHTINGS · real report size / 3×';host.append(sub)
   for(const record of records){const row=document.createElement('div');row.className='badge';row.style.flexWrap='wrap';row.append(record.mobile?'PHONE':'DESKTOP')
    for(const scale of[1,3]){const icon=new Image();icon.src=reports.strip;icon.width=260*record.board.width/800*scale;icon.height=24*record.board.width/800*scale;row.append(icon)}host.append(row)}
   document.body.replaceChildren(host)
  })()`)
  const height=await ev('document.body.scrollHeight')
  await b.cmd('Emulation.setDeviceMetricsOverride',{width:1080,height,deviceScaleFactor:1,mobile:false})
  await ev('Promise.all([...document.images].map(i=>i.decode())).then(()=>true)')
  const sheet=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})
  fs.writeFileSync(path.join(out,'ui-sheet.png'),Buffer.from(sheet.data,'base64'))
  fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify({records,errors:b.errors},null,2))
  return{records,errors:b.errors,height}
 }finally{await b.close();server.close()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.argv[2]||'shots/tour-art'
 captureUi(out,process.argv[3]).then(r=>console.log(JSON.stringify({out,height:r.height,errors:r.errors,views:r.records.map(v=>({mobile:v.mobile,pageWidth:v.pageWidth,viewport:v.viewport,icon:v.icons[0].canvas,daily:v.daily}))},null,2))).catch(e=>{console.error(e);process.exitCode=1})
}

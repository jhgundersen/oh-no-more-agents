#!/usr/bin/env node
// Reuse one disposable browser per batch. Native DOM text is measured and
// photographed at its actual CSS size, never approximated by render.js.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {serve,browser} from './phone.js'
import {CONTRAST} from './contrast.js'
import {load} from './render.js'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=x=>createHash('sha256').update(x).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms))
export async function panelEvaluate(b,expression){const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
export async function panelWait(b,expression){for(let i=0;i<60;i++){if(await panelEvaluate(b,expression))return;await sleep(50)}throw Error('Page not ready: '+expression)}
export async function panelView(b,base,{mobile=false,width=mobile?390:1280,height=mobile?844:1000,dpr=1,reduced=false,theme='tokyo-night',paused=true,full=false}={}){
 await b.cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile})
 await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile})
 await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]})
 await b.cmd('Page.navigate',{url:base+'?level=13&seed=3&season=none'+(full?'&full':'')})
 await panelWait(b,'window.AgentWorld&&AgentWorld()&&document.querySelectorAll("#themes button").length')
 await panelEvaluate(b,'Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))])')
 await panelEvaluate(b,`(()=>{document.getElementById('c-pause').click();const gen=generate;generate=(l,a,s)=>gen(l,a,s===undefined?3:s);document.getElementById('c-restart').click();generate=gen;const w=AgentWorld(),random=Math.random;try{Math.random=()=>.25;while(w.ticks<400&&!w.done)step(w)}finally{Math.random=random}document.querySelector('[data-theme="${theme}"]').click();document.getElementById('levelTitle').hidden=true;document.getElementById('tip').hidden=true;document.getElementById('who').getAttribute('aria-pressed')==='true'&&document.getElementById('who').click();${paused?'':"document.getElementById('overlay').style.visibility='hidden';"}scrollTo(0,0)})()`)
 const row=await panelEvaluate(b,`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}},board=rect(document.getElementById('board')),card=document.querySelector('.pause-card'),button=document.getElementById('overlay-line');return{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,board,card:card?rect(card):null,button:{...rect(button),text:button.textContent,tag:button.tagName},touch:matchMedia('(pointer: coarse)').matches,reduced:AgentWorld().reducedMotion,tick:AgentWorld().ticks,digest:JSON.stringify(AgentWorld())}})()`)
 row.digest=sha(row.digest);row.contrast=(await panelEvaluate(b,CONTRAST)).filter(r=>r.ratio<4.5);return row
}
export async function capturePanels(out,{root=path.join(ROOT,'public'),cases}={}){
 const server=await serve({root}),b=await browser(),records=[],started=performance.now();fs.mkdirSync(out,{recursive:true})
 cases ||= [{},{mobile:true},{mobile:true,dpr:2},{mobile:true,width:844,height:390},{reduced:true,theme:'gruvbox'},{mobile:true,reduced:true,theme:'nord'},{full:true,width:1280,height:720}]
 try{for(const[ci,c]of cases.entries()){
  const row=await panelView(b,'http://127.0.0.1:'+server.address().port+'/',c),name=String(ci+1).padStart(2,'0')+'-'+(c.mobile?'phone':'desktop'),images={}
  const board={x:Math.max(0,row.board.x),y:Math.max(0,row.board.y),width:Math.min(row.width,row.board.x+row.board.width)-Math.max(0,row.board.x),height:row.board.height,scale:1}
  for(const[suffix,clip]of[['',{x:0,y:0,width:row.width,height:Math.max(row.height,row.pageHeight),scale:1}],['-board',board]]){
   const png=Buffer.from((await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip})).data,'base64'),file=name+suffix+'.png';fs.writeFileSync(path.join(out,file),png);images[file]=sha(png)
  }
  records.push({name,...c,...row,images})
 }if(b.errors.length)throw Error(b.errors.join('\n'))
 }finally{await b.close();await new Promise(r=>server.close(r))}
 const result={sourceSHA256:sha(fs.readFileSync(path.join(root,'index.html'))),webSHA256:sha(fs.readFileSync(path.join(root,'agents/web.js'))),records,errors:b.errors,seconds:+((performance.now()-started)/1000).toFixed(2)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
export async function panelContact(out,before,after){
 const a=JSON.parse(fs.readFileSync(path.join(before,'manifest.json'))),z=JSON.parse(fs.readFileSync(path.join(after,'manifest.json'))),rows=a.records.map(r=>{
  const next=z.records.find(n=>n.name===r.name);if(!next||r.digest!==next.digest)throw Error('Scene mismatch '+r.name)
  return{name:r.name,before:fs.readFileSync(path.join(before,r.name+'-board.png')).toString('base64'),after:fs.readFileSync(path.join(after,r.name+'-board.png')).toString('base64')}
 }),b=await browser();let png
 try{const result=await b.cmd('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
 const rows=${JSON.stringify(rows)},glyphs=${JSON.stringify(load('Draw.js').TRANSITION_GLYPHS)},c=document.createElement('canvas');c.width=1640;c.height=rows.length*560;const ctx=c.getContext('2d');ctx.fillStyle='#121822';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;
 for(let i=0;i<rows.length;i++){const row=rows[i],y=i*560;ctx.fillStyle='#e6e9ee';let x=16;for(const ch of (row.name+' BEFORE / AFTER').toUpperCase()){if(!glyphs[ch])throw Error('Missing sheet glyph '+ch);for(let r=0;r<5;r++)for(let k=0;k<3;k++)if(glyphs[ch][r]&(4>>k))ctx.fillRect(x+k*2,y+10+r*2,2,2);x+=8}for(const[k,side]of['before','after'].entries()){const im=new Image;im.src='data:image/png;base64,'+row[side];await im.decode();const width=Math.min(800,im.width);ctx.drawImage(im,16+k*816,y+36,width,im.height*width/im.width)}}return c.toDataURL('image/png').split(',')[1]
 })()`});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));png=Buffer.from(result.result.value,'base64')
 }finally{await b.close()}
 const stamp=sha(z.sourceSHA256+z.webSHA256+fs.readFileSync(fileURLToPath(import.meta.url))).slice(0,8),name='contact-sheet-'+stamp+'.png'
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name),png);fs.writeFileSync(path.join(out,'contact-sheet.png'),png)
 const manifest={before:a.sourceSHA256,after:z.sourceSHA256,web:z.webSHA256,contactSheet:name,contactSHA256:sha(png),cases:rows.map(r=>r.name)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>Page panels - before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}img{image-rendering:pixelated;max-width:100%}a{color:#7aa2f7}</style><h1>Page panels</h1><p>Before / after. Actual CSS sizes, matching seeds/ticks/world digests; DPR2 is normalised to CSS size.</p><p><a href="${name}">Current sheet</a> - <a href="manifest.json">Source/image hashes</a></p><img src="${name}">`);return manifest
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await capturePanels(path.resolve(process.argv[2]||'shots/panels'),{root:process.argv[3]?path.resolve(process.argv[3]):undefined})))

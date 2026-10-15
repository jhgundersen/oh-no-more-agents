#!/usr/bin/env node
// Real browser evidence: native fillText is deliberately absent from render.js,
// so a software-only comparison would erase the old Who labels.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {serve,browser} from './phone.js'
import {load} from './render.js'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms))
export async function whoView(b,base,{level,season='none',mobile=false,tick=400}){
 const ev=async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 await b.cmd('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:1000,deviceScaleFactor:1,mobile})
 await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile})
 await b.cmd('Page.navigate',{url:base+'?level='+level+'&seed=3&season='+season})
 let ready=false;for(let i=0;i<80;i++){if(await ev('window.AgentWorld?.()?.level==='+level)){ready=true;break}await sleep(40)}if(!ready)throw Error('World timeout')
 await ev('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))])')
 return ev(`(()=>{
 document.getElementById('c-pause').click();const gen=generate;generate=(l,a,s)=>gen(l,a,s===undefined?3:s);document.getElementById('c-restart').click();generate=gen;
 const w=AgentWorld(),random=Math.random;try{Math.random=()=>.25;for(let i=0;i<${tick}&&!w.done;i++)step(w)}finally{Math.random=random}
 document.querySelector('#themes .theme.on').click();if(document.getElementById('who').getAttribute('aria-pressed')!=='true')document.getElementById('who').click();
 document.getElementById('levelTitle').hidden=true;document.getElementById('overlay').style.visibility='hidden';document.getElementById('tip').hidden=true;scrollTo(0,0);
 const r=document.getElementById('board').getBoundingClientRect();
 return {level:w.level,biome:w.biome,tick:w.ticks,season:w.season||null,mobile:${mobile},who:document.getElementById('who').getAttribute('aria-pressed'),fontReady:document.fonts.status,width:innerWidth,pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,
 board:{x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(innerWidth,r.right)-Math.max(0,r.x),height:r.height},digest:JSON.stringify(w)}
 })()`)
}
export async function whoScreens(out,{root=path.join(ROOT,'public'),cases}={}){
 const started=performance.now(),server=await serve({root}),b=await browser(),records=[]
 cases ||= [...Array.from({length:20},(_,i)=>({level:i+1})),...['halloween','christmas'].flatMap(season=>[7,12,13,20].map(level=>({level,season}))),{level:20,tick:330,season:'christmas'},{level:17,tick:252,season:'halloween'}]
 fs.mkdirSync(out,{recursive:true})
 try{for(const mobile of[false,true])for(const info of cases){
  const row=await whoView(b,'http://127.0.0.1:'+server.address().port+'/',{...info,mobile}),name=(info.season||'normal')+'-'+(mobile?'phone':'desktop')+'-'+String(info.level).padStart(2,'0')+(info.tick?'-t'+info.tick:'')
  for(const [suffix,clip]of[['',{x:0,y:0,width:row.width,height:Math.max(row.pageHeight,mobile?844:1000),scale:1}],['-board',{...row.board,scale:1}]]){
   const shot=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});fs.writeFileSync(path.join(out,name+suffix+'.png'),Buffer.from(shot.data,'base64'))
  }
  row.digest=sha(row.digest);row.images=Object.fromEntries(['','-board'].map(suffix=>[name+suffix+'.png',sha(fs.readFileSync(path.join(out,name+suffix+'.png')))]));records.push({name,...row});console.log(name+' '+row.biome)
 }
 if(b.errors.length)throw Error(b.errors.join('\n'))
 }finally{await b.close();await new Promise(r=>server.close(r))}
 const result={sourceSHA256:sha(fs.readFileSync(path.join(root,'agents/Draw.js'))),seconds:+((performance.now()-started)/1000).toFixed(2),records,errors:b.errors}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
export async function whoContact(out,before,after){
 const a=JSON.parse(fs.readFileSync(path.join(before,'manifest.json'))),z=JSON.parse(fs.readFileSync(path.join(after,'manifest.json'))),
  rows=a.records.map(r=>{const next=z.records.find(n=>n.name===r.name);if(!next||r.digest!==next.digest)throw Error('Mismatched scene '+r.name);return{...r,before:fs.readFileSync(path.join(before,r.name+'-board.png')).toString('base64'),after:fs.readFileSync(path.join(after,r.name+'-board.png')).toString('base64')}}),b=await browser()
 let png
 try{
  const result=await b.cmd('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
   const rows=${JSON.stringify(rows)},glyphs=${JSON.stringify(load('Draw.js').TRANSITION_GLYPHS)},c=document.createElement('canvas');c.width=1640;c.height=rows.length*540+40;const ctx=c.getContext('2d');ctx.fillStyle='#121822';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;
   function text(s,x,y){ctx.fillStyle='#e6e9ee';s=s.toUpperCase();for(const ch of s){if(!glyphs[ch])throw Error('Missing sheet glyph '+ch);for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(glyphs[ch][row]&(4>>col))ctx.fillRect(x+col*2,y+row*2,2,2);x+=8}}
   for(let i=0;i<rows.length;i++){const r=rows[i],y=i*540;text(r.name.replaceAll('-',' ')+' - BEFORE / AFTER',16,y+12);for(const[k,side]of['before','after'].entries()){const im=new Image();im.src='data:image/png;base64,'+r[side];await im.decode();ctx.drawImage(im,16+k*816,y+36);if(r.mobile){text('3X DETAIL',16+k*816,y+300);ctx.drawImage(im,r.tick===330?240:r.level===17?235:r.level===20?100:r.level===7?90:70,r.tick===330?115:r.level===17?130:r.level===20?170:r.level===7?140:35,120,60,16+k*816,y+324,360,180)}}}
   return c.toDataURL('image/png').split(',')[1]
  })()`})
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));png=Buffer.from(result.result.value,'base64')
 }finally{await b.close()}
 const stamp=sha(z.sourceSHA256+fs.readFileSync(fileURLToPath(import.meta.url))).slice(0,8),name='contact-sheet-'+stamp+'.png';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,name),png);fs.writeFileSync(path.join(out,'contact-sheet.png'),png)
 const manifest={before:a.sourceSHA256,after:z.sourceSHA256,contactSheet:name,contactSHA256:sha(png),cases:rows.map(({name,digest})=>({name,digest}))}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><title>Who is who - consistency review</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}img{image-rendering:pixelated;max-width:100%}a{color:#7aa2f7}</style><h1>Who is who.</h1><p>Before / after at actual desktop and 390px phone size; phone detail at 3x. Same seeds, ticks and world digests.</p><p><a href="${name}">Current contact sheet</a> - <a href="manifest.json">Source and image hashes</a></p><img src="${name}">`)
 return manifest
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(await whoScreens(path.resolve(arg('--out','shots/who')),{root:path.resolve(arg('--root',path.join(ROOT,'public')))})))
}

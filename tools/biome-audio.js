#!/usr/bin/env node
// Bounded local OfflineAudioContext previews; no assets or production requests.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {browser,serve} from './phone.js'
import {loadCore} from './load-core.js'
export const AUDIO_BIOMES=loadCore('Sim.js').BIOMES
export function wav(pcm,rate=12000){
 const b=Buffer.alloc(44+pcm.length*2);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length*2,40)
 for(let i=0;i<pcm.length;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),44+i*2)
 return b
}
function evaluator(b){return async expression=>{
 const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
 if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value
}}
export async function renderPreview(ev,source,biome,{cues=false,seconds=9}={}){
 return ev(`(async()=>{
 const raw=new OfflineAudioContext(1,12000*${seconds},12000);let at=0;
 const context=new Proxy(raw,{get(target,key){if(key==='currentTime')return at;if(key==='state')return 'running';if(key==='resume')return()=>Promise.resolve();const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v}});
 const scope={AudioContext:function(){return context}},sfx=new Function('window','performance',${JSON.stringify(source)}+';return window.AgentSfx')(scope,{now:()=>at*1000});
 const start=performance.now();sfx.setOn(true);if(sfx.scene)sfx.scene({biome:${JSON.stringify(biome)}},true);const buildMs=performance.now()-start;
 if(${!!cues}){at=2;sfx.cue('home');at=4;sfx.cue('pop');at=6;sfx.cue('quack')}
 const result=await raw.startRendering(),a=result.getChannelData(0),bytes=new Uint8Array(a.length*2),view=new DataView(bytes.buffer);let sum=0,peak=0,edge=0,seamJump=0;
 for(let i=0;i<a.length;i++){if(i===96000)seamJump=Math.abs(a[i]-a[i-1]);sum+=a[i]*a[i];peak=Math.max(peak,Math.abs(a[i]));if(i>95880&&i<96120)edge=Math.max(edge,Math.abs(a[i]-a[i-1]));view.setInt16(i*2,Math.round(Math.max(-1,Math.min(1,a[i]))*32767),true)}
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return{pcm:btoa(binary),rms:Math.sqrt(sum/a.length),peak,edge,seamJump,buildMs,samples:a.length}
 })()`)
}
function writePreview(out,name,r){
 const pcm=Buffer.from(r.pcm,'base64'),samples=new Float32Array(pcm.length/2)
 for(let i=0;i<samples.length;i++)samples[i]=pcm.readInt16LE(i*2)/32767
 fs.writeFileSync(path.join(out,name+'.wav'),wav(samples));const {pcm:discard,...stats}=r;return{name,...stats}
}
export async function captureAudio(out,{before}={}){
 fs.mkdirSync(out,{recursive:true});const b=await browser(),ev=evaluator(b),records=[]
 try{
  const source=fs.readFileSync(new URL('../public/agents/sfx.js',import.meta.url),'utf8')
  for(const biome of AUDIO_BIOMES){const r=await renderPreview(ev,source,biome);records.push(writePreview(out,biome.toLowerCase().replaceAll(' ','-'),r))}
  for(const biome of['Rooftops','Trench','Data Center','Clock Tower','Library','The Cloud']){
   for(const [tag,code]of[...(before?[['before',fs.readFileSync(path.join(before,'agents/sfx.js'),'utf8')]]:[]),['after',source]]){
    records.push(writePreview(out,biome.toLowerCase().replaceAll(' ','-')+'-'+tag,await renderPreview(ev,code,biome,{cues:true})))
   }
  }
  auditionPage(out,records)
  const report={records,errors:b.errors};fs.writeFileSync(path.join(out,'audio.json'),JSON.stringify(report,null,2));return report
 }finally{await b.close()}
}
function auditionPage(out,records){
 const pairs=['Rooftops','Trench','Data Center','Clock Tower','Library','The Cloud'].map(name=>{
  const key=name.toLowerCase().replaceAll(' ','-'),before=records.some(r=>r.name===key+'-before')
  return `<section><h2>${name}</h2><div>${before?`<label>Before · cues only<audio controls preload="none" src="${key}-before.wav"></audio></label>`:''}<label>After · same cues + bed<audio controls preload="none" src="${key}-after.wav"></audio></label><label>Bed alone<audio controls preload="none" src="${key}.wav"></audio></label></div></section>`
 }).join('')
 const rest=AUDIO_BIOMES.map(name=>`<label>${name}<audio controls preload="none" src="${name.toLowerCase().replaceAll(' ','-')}.wav"></audio></label>`).join('')
 fs.writeFileSync(path.join(out,'review.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Oh No! More Agents · biome sound comparison</title><style>body{background:#1a1b26;color:#c0caf5;font:16px system-ui;margin:32px auto;padding:0 16px;max-width:1050px}h1{font-size:24px}h2{font-size:19px;color:#e0af68}section{border-top:1px solid #414868;padding:12px 0}section div,.beds{display:flex;flex-wrap:wrap;gap:16px}label{display:flex;flex-direction:column;gap:8px;font-size:13px}audio{width:310px;max-width:100%}p{line-height:1.5}.beds label{padding:12px 0}</style><h1>Oh No! More Agents · a little sense of place</h1><p>Original playback level. Sound stays off by default in the game. Each comparison has the same home, umbrella and duck cues at 2, 4 and 6 seconds; only the new ambience differs. Beds fade in over 0.4 s and loop at 8 s. The Library uses its indoor voice.</p>${pairs}<h2>All twenty beds</h2><div class="beds">${rest}</div></html>`)
}
const TRACE=`(()=>{
 const AC=window.AudioContext||window.webkitAudioContext,trace=window.__beds={sources:[],gains:[],buffers:[],scenes:[],contexts:0};
 window.AudioContext=function(){
  const c=new AC();trace.contexts++;const source=c.createBufferSource.bind(c),gain=c.createGain.bind(c),buffer=c.createBuffer.bind(c);
  c.createBuffer=function(...args){trace.buffers.push(args);return buffer(...args)};
  c.createGain=function(){const g=gain(),disconnect=g.disconnect.bind(g);g.__closed=false;g.disconnect=function(...a){g.__closed=true;return disconnect(...a)};trace.gains.push(g);return g};
  c.createBufferSource=function(){const s=source(),start=s.start.bind(s),disconnect=s.disconnect.bind(s);s.__live=false;s.__closed=false;
   s.start=function(...a){s.__live=true;return start(...a)};s.addEventListener('ended',()=>{s.__live=false});
   s.disconnect=function(...a){s.__closed=true;return disconnect(...a)};trace.sources.push(s);return s};return c;
 };
})()`
export async function liveAudio(out,{root}={}){
 fs.mkdirSync(out,{recursive:true});const server=await serve({root}),b=await browser(),ev=evaluator(b)
 const base='http://127.0.0.1:'+server.address().port,wait=ms=>new Promise(r=>setTimeout(r,ms)),states=[]
 const state=async name=>{const r=await ev(`(()=>{const t=window.__beds,w=AgentWorld();return{on:AgentSfx.isOn(),contexts:t.contexts,live:t.sources.filter(s=>s.loop&&s.__live).length,open:t.sources.filter(s=>s.loop&&!s.__closed).length,bedBuffers:t.buffers.filter(a=>a[1]===96000).length,biome:w.biome,speed:document.getElementById('speedWord').textContent}})()`);states.push({name,...r});return r}
 try{
  await b.cmd('Page.addScriptToEvaluateOnNewDocument',{source:TRACE})
  await b.cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true})
  await b.cmd('Page.navigate',{url:base+'/?level=17&seed=3&season=halloween'})
  let ready=false;for(let i=0;i<80;i++){if(await ev('!!window.AgentWorld?.()')){ready=true;break}await wait(40)}if(!ready)throw Error('Audio page startup timed out')
  await state('default-off')
  await b.cmd('Runtime.evaluate',{expression:"document.getElementById('sfx').click()",userGesture:true});await wait(500);await state('enabled')
  await ev("(()=>{const t=__beds,original=AgentSfx.scene;AgentSfx.scene=(w,a)=>{t.scenes.push({biome:w.biome,active:!!a});return original(w,a)}})()")
  for(let i=0;i<3;i++){await ev("document.getElementById('speed').click()");await state('speed-'+i)}
  await ev("document.getElementById('c-pause').click()");await wait(300);await state('paused')
  await ev("document.getElementById('c-pause').click()");await wait(500);await state('resumed')
  await ev("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");await wait(300);await state('hidden')
  await ev("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");await wait(500);await state('visible')
  await ev("document.getElementById('sfx').click()");await wait(300);await state('muted')
  await b.cmd('Runtime.evaluate',{expression:"document.getElementById('sfx').click()",userGesture:true});await wait(500);await state('unmuted')
  await ev("document.getElementById('c-next').click()");await wait(500);await state('next-biome')
  await ev("document.getElementById('c-pause').click();const w=AgentWorld();w.done=true;w.doneTicks=0;w.moments=[];document.getElementById('c-pause').click()");await wait(300);await state('report')
  const shot=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,'phone-halloween.png'),Buffer.from(shot.data,'base64'))
  const cleanup=await ev(`(()=>{const t=__beds;return{sources:t.sources.filter(s=>s.loop).length,closed:t.sources.filter(s=>s.loop&&s.__closed).length,gainsClosed:t.gains.filter(g=>g.__closed).length,scenes:t.scenes.slice(-10)}})()`)
  const r={states,cleanup,errors:b.errors};fs.writeFileSync(path.join(out,'live.json'),JSON.stringify(r,null,2));return r
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2).filter(a=>a!=='--live'),out=args[0]||'shots/biome-audio'
 captureAudio(out,{before:args[1]}).then(async r=>{
  if(process.argv.includes('--live'))r.live=await liveAudio(path.join(out,'live'))
  console.log(JSON.stringify(r,null,2))
 }).catch(e=>{console.error(e);process.exitCode=1})
}

#!/usr/bin/env node
// Hero introductions at actual CSS size, using the shared one-browser caption
// harness. Fixtures pin the hero/fact; live events and lifecycle stay real.
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {captureCaptions,captionLifecycle} from './captions.js'
export const HERO_VIEWS=[
 {name:'hero-desktop',level:20,width:1280,height:900,mobile:false,hero:'cloudprovider',fact:2},
 {name:'hero-phone',level:9,width:390,height:844,mobile:true,hero:'autocomplete',fact:3},
 {name:'hero-small-phone',level:13,width:360,height:800,mobile:true,hero:'sapper',fact:1},
 {name:'hero-halloween',level:17,width:390,height:844,mobile:true,hero:'ladder',fact:1,season:'halloween'},
 {name:'hero-christmas',level:12,width:390,height:844,mobile:true,hero:'specdecoder',fact:2,season:'christmas'},
 {name:'hero-landscape',level:10,width:844,height:390,mobile:true,hero:'submarine',fact:0}
]
export async function setupHero(ev,v){
 return ev(`(()=>{
 const v=${JSON.stringify(v)};
 if(document.getElementById('pauseWord').textContent==='pause')document.getElementById('c-pause').click()
 const base=generate
 try{
  generate=function(level,attempt,seed){const w=base(level,attempt,seed===undefined?3:seed);w.special=v.hero;w.specialSpec=specialSpec(v.hero);w.factPick=v.fact;w.feed=[];return w}
  document.getElementById('c-restart').click()
 }finally{generate=base}
 const style=document.createElement('style');style.textContent='#stage *,#stage *::before,#stage *::after{transition:none!important;animation:none!important}';document.head.appendChild(style)
 const w=AgentWorld(),random=Math.random;let seed=317
 try{Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);for(let i=0;i<200&&!w.done;i++)step(w)}finally{Math.random=random}
 if(w.season)AgentSeason.dress(w)
 w.feed=[];if(w.season)w.season.note=null
 document.querySelector('#themes .theme.on').click();document.getElementById('who').click();document.getElementById('who').click()
 document.getElementById('overlay').style.visibility='hidden';document.getElementById('tip').hidden=true;document.getElementById('levelTitle').hidden=true;scrollTo(0,0)
 const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}},caption=document.getElementById('eventCaption'),text=document.getElementById('eventText'),facts=SPECIAL_FACTS[w.special]||[''],fact=facts[(w.factPick||0)%facts.length]
 return{level:w.level,biome:w.biome,ticks:w.ticks,hero:w.special,heroName:w.specialSpec.name,fact,expected:w.specialSpec.name+(fact?' · '+fact:''),
  caption:{...rect(caption),text:text.textContent,font:getComputedStyle(text).fontSize,textBox:rect(text),hidden:caption.getAttribute('aria-hidden'),live:caption.getAttribute('aria-live'),label:caption.getAttribute('aria-label')},
  scale:Number(document.getElementById('stage').dataset.boardScale),board:rect(document.getElementById('board')),stage:rect(document.getElementById('stage')),width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth}
 })()`)
}

export async function heroChecks(ev,b){
 const fitting=await ev(`(()=>{
 const c=document.getElementById('eventCaption'),text=document.getElementById('eventText'),failures=[];
 c.classList.remove('empty');let total=0;
 // Use the actual 360px CSS width for every canonical biography, not an
 // estimated character count. This does not change the world's hero.
 const oldWidth=c.style.width;c.style.width='336px';const width=c.getBoundingClientRect().width,height=c.getBoundingClientRect().height;
 for(const sp of SPECIALS)for(let pick=0;pick<(SPECIAL_FACTS[sp.id]||['']).length;pick++){
  const w={special:sp.id,specialSpec:sp,factPick:pick};text.textContent=skyCardCaption(w);total++;
  const r=text.getBoundingClientRect(),b=c.getBoundingClientRect();if(r.y<b.y||r.bottom>b.bottom||r.left<b.left||r.right>b.right)failures.push(text.textContent)
 }
 c.style.width=oldWidth;return{total,failures,width,height}
 })()`)
 const cache=await ev(`(()=>{
 const caption=skyCardCaption,gen=generate,refresh=()=>{for(let i=0;i<3;i++)document.getElementById('speed').click()},withHero=function(level,attempt,seed){const w=gen(level,attempt,3);w.special='sapper';w.specialSpec=specialSpec('sapper');w.factPick=0;w.feed=[];return w};let calls=0;
 skyCardCaption=function(w){calls++;return caption(w)};
 try{
  generate=withHero;
  document.getElementById('c-restart').click();generate=gen;
  const c=document.getElementById('eventCaption'),observer=new MutationObserver(()=>{});observer.observe(c,{subtree:true,childList:true,attributes:true});
  const before=JSON.stringify(AgentWorld());refresh();refresh();const rewrites=observer.takeRecords().length;observer.disconnect();
  const result={calls,rewrites,readOnly:before===JSON.stringify(AgentWorld()),text:document.getElementById('eventText').textContent,stageHeight:document.getElementById('stage').getBoundingClientRect().height};
  generate=function(level,attempt,seed){const w=gen(level,attempt,3);w.special=null;w.specialSpec=null;w.feed=[];return w};document.getElementById('c-restart').click();result.noHero=document.getElementById('eventText').textContent;result.noHeroHeight=document.getElementById('stage').getBoundingClientRect().height;
  generate=withHero;document.getElementById('c-restart').click();
  return result
 }finally{skyCardCaption=caption;generate=gen}
 })()`)
 const beforeResize=await ev('JSON.stringify(AgentWorld())'),resize=[]
 for(const [width,height,mobile]of[[1280,900,false],[390,844,true]]){
  await b.cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile})
  let ready=false;for(let i=0;i<80;i++){
   ready=await ev("document.getElementById('stage').dataset.boardScale==="+JSON.stringify(mobile?'1':'2')+"&&document.getElementById('eventText').textContent==="+(mobile?"skyCardCaption(AgentWorld())":"''"));if(ready)break;await new Promise(r=>setTimeout(r,25))
  }
  if(!ready)throw Error('Hero caption did not follow viewport resize')
  resize.push(await ev("({scale:Number(document.getElementById('stage').dataset.boardScale),text:document.getElementById('eventText').textContent})"))
 }
 const resizeReadOnly=beforeResize===await ev('JSON.stringify(AgentWorld())'),lifecycle=await captionLifecycle(ev)
 return{fitting,cache,resize,resizeReadOnly,...lifecycle}
}
export function captureHeroIntros(out,{root,before,checks=false}={}){
 return captureCaptions(out,{root,before,views:HERO_VIEWS,setup:setupHero,checks:checks?heroChecks:false,actualSize:true,heading:'READABLE HERO INTRODUCTIONS · BEFORE / AFTER · native CSS sizes'})
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2).filter(a=>a!=='--checks');captureHeroIntros(args[0]||'shots/hero-intros',{root:args[1],before:args[2],checks:process.argv.includes('--checks')}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1})
}

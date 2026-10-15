import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
import {stormScene,stormAdvance,stormBox,stormFrame,stormStrips,STORM_LEVELS,STORM_OFFSETS} from '../tools/storm-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=x=>createHash('sha256').update(x).digest('hex')
const OLD=renderer(execFileSync('git',['show','4088392:public/agents/Draw.js'],{maxBuffer:4<<20}).toString())
const phases=[['idle',0],['charge',5],['charge',25],['charge',45],['fire',0],['fire',5],['rest',0],['rest',8],['rest',12],['rest',170]]
function geometry(h){const x0=h.zx0*4,x1=(h.zx1+1)*4,y0=h.zy0*4,y1=(h.zy1+1)*4;return{x0,x1,y0,y1,wide:x1-x0,cx:Math.round((x0+x1)/2)}}
function scene(level=20){const{w,h}=stormScene(level);return{w,h,g:geometry(h),pal:P.build(themeOf('tokyo-night').theme,level)}}
function marks(fn){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{assert.ok(calls.length<3000,'bounded paint');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9,'inherited fade');calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);assert.equal(ctx.fillStyle,'#123456');return calls
}
function nativeAggregate(Draw){
 const sum=createHash('sha256'),poses=[['idle',0],['charge',5],['charge',25],['charge',45],['fire',0],['fire',5],['rest',0],['rest',8],['rest',12],['rest',170]]
 for(const level of[20,40,60,80,100])for(const name of Object.keys(THEMES))for(const res of[undefined,1,3])for(const reduced of[false,true]){
  const w=S.generate(level,0,3);w.res=res;w.reducedMotion=reduced;w.ticks=400;const h=w.hazards.find(h=>h.kind==='lightning'),pal=P.build(themeOf(name).theme,level)
  for(const[phase,t]of poses){Object.assign(h,{phase,t,fired:1});const img=canvas(400,248);Draw.drawHazardKind(img.ctx,w,pal,h);sum.update(img.buf)}
 }
 return sum.digest('hex')
}
test('native/default and share resolution retain the independent pre-pass lightning pixels across all phases and palettes',()=>{
 assert.equal(nativeAggregate(D),nativeAggregate(OLD))
 const{h}=scene()
 for(let level=1;level<20;level++){
  const w=S.generate(level,0,3);w.res=2;const pal=P.build(themeOf('tokyo-night').theme,level),a=canvas(400,248),b=canvas(400,248)
  D.drawHazardKind(a.ctx,w,pal,h);OLD.drawHazardKind(b.ctx,w,pal,h);assert.equal(hash(a.buf),hash(b.buf))
 }
})
test('storm frames seek a real 46-tick wind-up and six-tick strike without posing the world',()=>{
 assert.throws(()=>stormScene(1),/No lightning/)
 for(const level of STORM_LEVELS){
  const{w,h}=stormScene(level);assert.equal(w.ticks,170);assert.equal(h.phase,'charge');assert.equal(h.t,0)
  const seen=[]
  for(let i=0;i<STORM_OFFSETS.length;i++){if(i)stormAdvance(w,STORM_OFFSETS[i]-STORM_OFFSETS[i-1]);seen.push([h.phase,h.t])}
  assert.deepEqual(seen.slice(6,11),[['charge',45],['fire',0],['fire',3],['rest',0],['rest',4]])
 }
})
test('the volumetric storm head is cached, refreshed by actual terrain edits and clipped completely to air',()=>{
 const{w,g}=scene(),head=D.stormHeadLayout(w,g);assert.ok(head.length>15);assert.equal(D.stormHeadLayout(w,g),head)
 for(const r of head){assert.ok(r.x>=g.x0-3&&r.x+r.width<=g.x1+3&&r.y>=g.y0&&r.y+r.height<=g.y0+7);for(let y=r.y;y<r.y+r.height;y+=0.5)for(let x=r.x;x<r.x+r.width;x+=0.5)assert.equal(w.terrain[Math.floor(y/4)*100+Math.floor(x/4)],0)}
 assert.ok(new Set(head.map(r=>r.y+r.height)).size>4,'rounded irregular underside')
 const terrain=w.terrain;w.terrain=new Proxy(terrain,{get(){throw Error('live head terrain scan')}});assert.equal(D.stormHeadLayout(w,g),head);w.terrain=terrain
 S.setCell(w,Math.floor(g.cx/4),Math.floor((g.y0+3)/4),w.k.STEEL);assert.notEqual(D.stormHeadLayout(w,g),head)
 w.terrain.fill(w.k.STEEL);w.terrainVersion++;assert.equal(D.stormHeadLayout(w,g).length,0)
 assert.notEqual(D.stormHeadLayout(w,{...g,x0:g.x0+4,x1:g.x1+4,cx:g.cx+4}),D.stormHeadLayout(w,g))
})
test('the two-pixel live channel and fine forks are stable, air-clipped and inside the lethal column',()=>{
 const{w,h,g}=scene();h.fired=1;h.t=0
 const draw=()=>marks(ctx=>{ctx.save();D.drawStormDischarge(ctx,w,h,g,0.35);ctx.restore()})
 const first=draw();assert.ok(first.length>40&&first.length<300);assert.ok(new Set(first.filter(c=>c[4]===D.BOLT&&c[2]===2&&c[3]===0.5&&c[1]<g.y0+10).map(c=>c[0])).size>1,'jagged main channel, not a straight line')
 for(const[x,y,width,height]of first){assert.ok(x>=g.x0&&x+width<=g.x1&&y>=g.y0+3&&y+height<=g.y1);assert.ok((width===g.wide&&height===1)||(width<=4&&height===0.5));for(let yy=y;yy<y+height;yy+=0.5)for(let xx=x;xx<x+width;xx+=0.5)assert.equal(w.terrain[Math.floor(yy/4)*100+Math.floor(xx/4)],0)}
 w.ticks+=13;assert.deepEqual(draw(),first,'no jitter or global-clock flash')
 assert.ok(first.some(c=>c[0]<=g.x0+1)&&first.some(c=>c[0]>=g.x1-1),'two short forks')
 w.terrain.fill(w.k.STEEL);assert.equal(draw().length,0)
})
test('late charge retains a steady increasing full-column warning; no bolt is drawn during wind-up',()=>{
 const{w,h,g,pal}=scene(),draw=progress=>marks(ctx=>D.drawPageStorm(ctx,w,pal,h,{...g,winding:true,progress}))
 const early=draw(0.2),late=draw(0.95)
 assert.ok(!early.some(c=>c[4]===D.BOLT))
 assert.ok(late.some(c=>c[4]===D.BOLT&&c[1]>=g.y0+7&&c[2]===g.wide))
 assert.ok(!late.some(c=>c[4]===D.BOLT&&c[2]===2&&c[3]===0.5),'no full discharge core during warning')
 assert.notEqual(hash(JSON.stringify(early)),hash(JSON.stringify(late)))
 const quiet=marks(ctx=>{ctx.save();D.drawStormTension(ctx,w,h,{...g,progress:0.2},0.35);ctx.restore()});assert.equal(quiet.length,0)
})
test('reduced motion holds the full head, warning and strike still and suppresses loose sparks',()=>{
 const{w,h,g,pal}=scene();w.reducedMotion=true;h.fired=1
 for(const state of[{},{winding:true,progress:0.9},{live:true},{cool:0.7}]){
  const draw=()=>marks(ctx=>D.drawPageStorm(ctx,w,pal,h,{...g,...state})),first=draw()
  for(const tick of[1,8,60,175]){w.ticks=tick;h.t=tick%6;assert.deepEqual(draw(),first)}
 }
 w.terrain.fill(0);assert.equal(marks(ctx=>{ctx.save();D.drawStormAfterglow(ctx,w,h,{...g,cool:1},0.35);ctx.restore()}).length,0)
})
test('new storm paint is read-only, RNG-free, grid aligned, deterministic and bounded in every palette',()=>{
 const random=Math.random
 try{for(const level of STORM_LEVELS)for(const name of Object.keys(THEMES))for(const reduced of[false,true]){
  const{w,h}=stormScene(level);w.reducedMotion=reduced;const pal=P.build(themeOf(name).theme,level)
  for(const[phase,t]of phases){Object.assign(h,{phase,t,fired:1});const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('draw RNG')};const draw=()=>marks(ctx=>D.drawHazardKind(ctx,w,pal,h));const a=draw();assert.deepEqual(draw(),a);assert.ok(a.length<400);assert.equal(hash(JSON.stringify(w)),before);Math.random=random}
 }}finally{Math.random=random}
})
test('storm art preserves complete real simulation digests and the established lightning timings and deaths',()=>{
 const random=Math.random
 try{for(const level of STORM_LEVELS){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2;const pal=P.build(themeOf('tokyo-night').theme,level),img=canvas(800,496)
  for(let n=0;n<800;n++){Math.random=()=>0.25;S.step(a);S.step(b);if(n%17===0){for(const h of a.hazards)if(h.kind==='lightning')D.drawHazardKind(img.ctx,a,pal,h);assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}}
 }}finally{Math.random=random}
 assert.equal(S.hazardSpec('lightning').charge,46);assert.equal(S.hazardSpec('lightning').fire,6)
})
test('cached actor crops equal full frames through carving and native/page resolution changes',()=>{
 const{w,h}=stormScene(),cache={};stormAdvance(w,49)
 for(const res of[1,2])for(const edit of[false,true]){
  w.res=res;if(edit)S.setCell(w,h.zx0,h.zy1,w.k.STEEL)
  const box=stormBox(w,h),img=canvas(400*res,248*res,themeOf('tokyo-night').background),pal=P.build(themeOf('tokyo-night').theme,w.level)
  D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{intro:false,feed:false})
  assert.equal(hash(stormFrame(D,w,h,cache).buf),hash(crop(img,box.x*res,box.y*res,box.width*res,box.height*res).buf))
 }
})
test('review exports every linked frame sheet and documents the actual nonuniform phase offsets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'storm-art-'))
 try{const r=stormStrips(dir,{base:'4088392',levels:[20]});assert.equal(r.records[0].frames.length,12);assert.equal(r.records[0].frames[8].phase,'fire');for(const name of['20-after-res2.png','20-frames.png','contact-sheet.png'])assert.ok(fs.statSync(path.join(dir,name)).size>0);assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/Equal review display time per pose/)}finally{fs.rmSync(dir,{recursive:true,force:true})}
})

test('the live discharge stays behind opaque faces, collars, eyes and umbrella rims',()=>{
 const{w,h,pal}=scene();w.feed=[];w.outage=null;w.milestone=null;w.particles=[]
 const ag=Object.assign(S.spawn(w),{x:h.zx0+1.5,y:h.zy1,dir:1,state:'fall',floater:true,ownBrolly:true,fall:8,anim:8,trait:'steady',special:false,shotFor:0})
 w.agents=[ag];Object.assign(h,{phase:'fire',t:3,fired:1})
 const one=canvas(800,496),all=canvas(800,496);one.ctx.setTransform(2,0,0,2,0,0)
 D.drawActorColony(one.ctx,w,pal,{});D.drawActors(all.ctx,w,pal,{intro:false,feed:false})
 const colors=[pal.skin,pal.shirt,pal.eye,pal.umbrellaRim].map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)));let checked=0
 for(let i=0;i<one.buf.length;i+=3)if(colors.some(c=>c.every((v,j)=>one.buf[i+j]===v))){for(let j=0;j<3;j++)assert.equal(all.buf[i+j],one.buf[i+j]);checked++}
 assert.ok(checked>100,'opaque colony pixels in front of the actual strike')
})

test('late warning pixels below the head meet or exceed the original contrast in every palette',()=>{
 for(const level of STORM_LEVELS)for(const name of Object.keys(THEMES))for(const t of[17,24,32,40,45]){
  const{w,h,g}=scene(level),pal=P.build(themeOf(name).theme,level);Object.assign(h,{phase:'charge',t})
  const a=canvas(800,496,themeOf(name).background),b=canvas(800,496,themeOf(name).background)
  for(const img of[a,b]){D.drawTerrain(img.ctx,w,pal);img.ctx.setTransform(2,0,0,2,0,0)}
  OLD.drawHazardKind(a.ctx,w,pal,h);D.drawHazardKind(b.ctx,w,pal,h)
  let gain=0,checked=0
  for(let y=(g.y0+7)*2;y<g.y1*2;y++)for(let x=g.x0*2;x<g.x1*2;x++){
   if(w.terrain[Math.floor(y/8)*100+Math.floor(x/8)])continue
   const at=(y*800+x)*3
   for(let c=0;c<3;c++){assert.ok(b.buf[at+c]>=a.buf[at+c],'no weaker than the original column');gain+=b.buf[at+c]-a.buf[at+c]}
   checked++
  }
  assert.ok(checked>500&&gain>500,'visible improvement over the original warning')
 }
})
test('the white main channel stays two art pixels wide throughout fire, with a four-pixel halo',()=>{
 const{w,h,g}=scene();w.reducedMotion=true
 for(const t of[0,3,5]){
  h.t=t;h.fired=1
  const calls=marks(ctx=>{ctx.save();D.drawStormDischarge(ctx,w,h,g,0.35);ctx.restore()})
  const core=calls.filter(c=>c[4]===D.BOLT&&c[1]<g.y1-3&&c[3]===0.5),halo=calls.filter(c=>c[4]===D.CLOUD_LILAC&&c[2]===4)
  assert.ok(core.filter(c=>c[2]===2&&c[5]===0.35).length>20)
  assert.ok(core.some(c=>c[2]===0.5),'fine outer forks retained');assert.ok(halo.length>20)
 }
})
test('the strike flash fades over six ticks, stays local and respects reduced motion and terrain',()=>{
 const{w,h,g}=scene(),draw=()=>marks(ctx=>{ctx.save();D.drawStormFlash(ctx,w,h,g,0.35);ctx.restore()});let previous=1
 for(let t=0;t<6;t++){
  h.t=t;const calls=draw();assert.ok(calls.length>0)
  for(const[x,y,width,height,color,alpha]of calls){assert.equal(x,g.x0);assert.equal(width,g.wide);assert.ok(y>=g.y0+3&&y+height<=g.y1);assert.equal(color,D.BOLT);assert.ok(alpha<previous)}
  previous=calls[0][5]
 }
 h.t=6;assert.equal(draw().length,0);h.t=0;w.reducedMotion=true;assert.equal(draw().length,0)
 w.reducedMotion=false;w.terrain.fill(w.k.STEEL);assert.equal(draw().length,0)
})

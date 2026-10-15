import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
import {transporterScene,transporterAdvance,transporterBox,transporterFrame,transporterReview,TRANSPORT_CASES,TRANSPORT_PHASES} from '../tools/transporter-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),OLD=renderer(execFileSync('git',['show','5822e88:public/agents/Draw.js'],{maxBuffer:4<<20}).toString()),hash=x=>createHash('sha256').update(x).digest('hex'),pal=P.build(themeOf('tokyo-night').theme,27)
function marks(fn){const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=.35;ctx.fillRect=(...r)=>{assert.ok(calls.length<400);assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)));assert.ok(ctx.globalAlpha<=.35+1e-9);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])};fn(ctx);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.35);return calls}
test('natural beaming scenes are bounded and show a real relocated passenger',()=>{
 for(const level of TRANSPORT_CASES){const{w,p}=transporterScene(level),a=w.agents.find(a=>a.id===p.who);assert.equal(w.biome,'Spaceship');assert.equal(p.usedAt,w.ticks);assert.equal(Math.floor(a.x),p.bx);assert.equal(a.y,p.by);const tick=w.ticks;transporterAdvance(w,3);assert.equal(w.ticks,tick+3)}
 assert.throws(()=>transporterScene(1),/No natural transporter/)
})
test('native/default/share transporters and every Mail Room resolution retain exact old pixels',()=>{
 const a=createHash('sha256'),b=createHash('sha256')
 for(const level of[7,27,54,87,107]){
  const w=S.generate(level,0,3),p=w.pads[0]
  for(const res of[undefined,1,2,3]){if(res===2&&!p.tube)continue;w.res=res
   for(const theme of Object.keys(THEMES))for(const age of[0,4,9,23,24]){w.ticks=100+age;p.usedAt=100;for(const[draw,sum]of[[D,a],[OLD,b]]){const img=canvas(400*(res||1),248*(res||1));img.ctx.setTransform(res||1,0,0,res||1,0,0);draw.drawPadPair(img.ctx,w,P.build(themeOf(theme).theme,level),p);sum.update(img.buf)}}
  }
 }
 assert.equal(a.digest('hex'),b.digest('hex'))
})
test('page machinery and every beam phase stay bounded, half-pixel aligned, terrain-clipped and read-only',()=>{
 const random=Math.random
 try{for(const level of TRANSPORT_CASES){const{w,p}=transporterScene(level);for(const age of[-1,0,1,4,8,9,10,18,23,24,100]){
  w.ticks=p.usedAt+age;const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render entropy')};const calls=marks(c=>D.drawPadPair(c,w,pal,p));assert.ok(calls.length>20)
  for(const[x,y,width,height]of calls){const at=[{x:p.ax,y:p.ay},{x:p.bx,y:p.by}].find(q=>x>=(q.x-1)*4-.5&&x+width<=(q.x+2)*4+.5);assert.ok(at);const base=(at.y+1)*4;assert.ok(y>=base-18&&y+height<=base+2);if(y+height<=base)for(let yy=y;yy<y+height;yy+=.5)for(let xx=x;xx<x+width;xx+=.5)assert.ok(D.mechanismAir(w,xx,yy))}
  assert.equal(hash(JSON.stringify(w)),before);Math.random=random
 }
 for(const theme of Object.keys(THEMES)){const img=canvas(800,496);D.drawPadPair(img.ctx,w,P.build(themeOf(theme).theme,level),p)}
 }}finally{Math.random=random}
})
test('recharge fills four lamps, coils breathe gently only when ready, and reduced motion stays still',()=>{
 const{w,p}=transporterScene(),x=p.ax,y=p.ay
 const pictures=[];for(const charge of[0,.25,.5,.75,1])pictures.push(hash(JSON.stringify(marks(c=>D.drawPageTransporter(c,w,pal,x,y,charge)))));assert.equal(new Set(pictures).size,5)
 w.ticks=100;const first=marks(c=>D.drawPageTransporter(c,w,pal,x,y,1));w.ticks+=12;assert.notDeepEqual(marks(c=>D.drawPageTransporter(c,w,pal,x,y,1)),first)
 w.reducedMotion=true;const calm=marks(c=>D.drawPageTransporter(c,w,pal,x,y,1));w.ticks+=120;assert.deepEqual(marks(c=>D.drawPageTransporter(c,w,pal,x,y,1)),calm)
 const beam=marks(c=>D.drawPageTransportBeam(c,w,x,y,0,-1));for(const age of[1,5,12,23])assert.deepEqual(marks(c=>D.drawPageTransportBeam(c,w,x,y,age,-1)),beam)
 const a=w.agents.find(a=>a.id===p.who);w.ticks=p.usedAt;assert.equal(D.drawBeamArrival(canvas(400,248).ctx,w,a),false,'show the real body without a travelling scan');w.res=1;assert.equal(D.drawBeamArrival(canvas(400,248).ctx,w,a),true,'native unchanged')
 w.res=2;w.reducedMotion=false;assert.equal(D.drawBeamArrival(canvas(400,248).ctx,w,a),true,'normal moving arrival stays on the real traveller')
})
test('missing support suppresses the hardware; air chunks never cross covered cells or world edges',()=>{
 const{w,p}=transporterScene(),base=(p.ay+1)*4,x=(p.ax-1)*4
 S.setCell(w,p.ax,p.ay+1,w.k.EMPTY);assert.equal(D.transporterGround(w,p.ax,p.ay),false);assert.equal(marks(c=>D.drawPageTransporter(c,w,pal,p.ax,p.ay,1)).length,0);assert.equal(marks(c=>D.drawPageTransportBeam(c,w,p.ax,p.ay,2,-1)).length,0)
 for(const[a,b]of[[-1,3],[100,3],[3,-1],[3,62]])assert.equal(D.transporterGround(w,a,b),false)
 w.terrain.fill(w.k.EMPTY);w.terrain[10*100+10]=w.k.ROCK;const calls=marks(c=>{c.save();D.transporterAir(c,w,37.5,37.5,12,12);D.transporterAir(c,w,-4,-4,3,3);c.restore()});for(const[xx,yy,ww,hh]of calls)for(let py=yy;py<yy+hh;py+=.5)for(let px=xx;px<xx+ww;px+=.5)assert.ok(D.mechanismAir(w,px,py))
 assert.equal(marks(c=>D.drawPageTransportBeam(c,w,x,base,-1,-1)).length,0)
})
test('receiver light has no second passenger silhouette, and direct crops match full-frame pixels through terrain edits',()=>{
 const{w,p}=transporterScene(),colors=P.build(themeOf('tokyo-night').theme,w.level),cache={}
 const small=transporterFrame(D,w,p,true,cache),box=transporterBox(w,p,true),full=canvas(800,496);D.drawTerrain(full.ctx,w,colors);D.drawActors(full.ctx,w,colors,{intro:false,feed:false});assert.equal(hash(small.buf),hash(crop(full,box.x*2,box.y*2,192,128).buf))
 const first=cache.terrain;w.res=1;transporterFrame(D,w,p,true,cache);assert.notEqual(cache.terrain,first);const next=cache.terrain;transporterFrame(D,w,p,true,cache,'nord');assert.notEqual(cache.terrain,next)
 w.res=2;const native=marks(c=>D.drawPageTransportBeam(c,w,p.bx,p.by,0,1)),departure=marks(c=>D.drawPageTransportBeam(c,w,p.ax,p.ay,0,-1));assert.ok(departure.length>native.length,'only the sending pad has an outgoing ghost')
 w.terrainVersion++;transporterFrame(D,w,p,true,cache);assert.notEqual(cache.terrain,next)
})
test('drawing between live steps leaves complete simulation digests identical through repeated transports',()=>{
 const random=Math.random
 try{Math.random=()=>.25;for(const level of TRANSPORT_CASES){const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2;const ctx=canvas(800,496).ctx
 for(let tick=0;tick<750&&!a.done;tick++){S.step(a);S.step(b);if(tick%11===0){for(const p of a.pads)D.drawPadPair(ctx,a,pal,p);assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}}assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)));assert.ok(a.pads.some(p=>p.usedAt>=0))}
 }finally{Math.random=random}
})
test('the bounded natural-event review exports native/page strips, animation and refreshed canonical hashes',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'transporter-art-'))
 try{const r=transporterReview(out,{levels:[27]});assert.equal(r.rows.length,1);assert.equal(r.rows[0].records.length,TRANSPORT_PHASES.length);for(const[file,digest]of Object.entries(r.images))assert.equal(hash(fs.readFileSync(path.join(out,file))),digest);fs.writeFileSync(path.join(out,'contact-sheet.png'),'stale');const next=transporterReview(out,{levels:[27]});assert.equal(hash(fs.readFileSync(path.join(out,'contact-sheet.png'))),next.contactSHA256);assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/prefers-reduced-motion/)}finally{fs.rmSync(out,{recursive:true,force:true})}
})

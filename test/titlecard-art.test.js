import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf,THEMES} from '../tools/render.js'
import {captureTitleCards} from '../tools/titlecard-art.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js')
const hash=x=>createHash('sha256').update(x).digest('hex')
test('twenty biome subtitle lists fit the pixel font, vary by visit, and use no RNG',()=>{
 assert.deepEqual(Object.keys(D.LEVEL_TITLE_LINES),S.BIOMES)
 for(let i=0;i<S.BIOMES.length;i++){
  const biome=S.BIOMES[i],seen=new Set()
  assert.equal(D.LEVEL_TITLE_LINES[biome].length,3)
  for(const line of D.LEVEL_TITLE_LINES[biome]){
   assert.ok(line.length<=43,line)
   for(const ch of line.toUpperCase())assert.ok(D.TRANSITION_GLYPHS[ch],ch)
  }
  for(let visit=0;visit<9;visit++){
   const level=i+1+visit*20
   const a=D.levelTitleSubtitle(level,biome)
   assert.equal(a,D.levelTitleSubtitle(level,biome));seen.add(a)
  }
  assert.equal(seen.size,3)
 }
 assert.ok(D.levelTitleSubtitle(2,'unknown'))
})
test('compact placement is deterministic, clears hatch/exit, and minimises route overlap among twelve spots',()=>{
 for(let level=1;level<=400;level++){
  const w=S.generate(level,0,3),before=hash(JSON.stringify(w)),r=D.levelTitleLayout(w),size=D.levelTitleSize(w),keep=D.levelTitleKeepClear(w)
  assert.ok(r.x>=12&&r.y>=28&&r.x+r.width<=388&&r.y+r.height<=236)
  assert.equal(r.height,w.bossPost?36:30);assert.equal(r.width,size.width)
  assert.ok(r.width<330,'width hugs the longer line, rather than the whole board')
  for(const rect of keep)assert.equal(D.levelTitleOverlap(r,rect),0,`level ${level}: hatch opening, first drop and exit clear`)
  assert.deepEqual(r,D.levelTitleLayout(w));assert.equal(hash(JSON.stringify(w)),before)
  const candidates=D.levelTitleCandidates(w,size);assert.equal(candidates.length,12)
  assert.ok(candidates.every(c=>D.levelTitleScore(w,r,keep)<=D.levelTitleScore(w,c,keep)))
 }
})
test('placement favours an empty pocket over ground, and moves away when that pocket contains a portal',()=>{
 const w=S.generate(13,0,3),k=w.k,size=D.levelTitleSize(w),pocket=D.levelTitleCandidates(w,size)[2]
 w.hatch={x:5,y:3};w.exit={x:88,y:51,w:5,h:7};w.terrain.fill(k.ROCK)
 for(let y=Math.floor(pocket.y/4);y<Math.ceil((pocket.y+pocket.height+24)/4);y++)
  for(let x=Math.floor(pocket.x/4);x<Math.ceil((pocket.x+pocket.width)/4);x++)w.terrain[y*k.COLS+x]=k.EMPTY
 assert.deepEqual(D.levelTitleLayout(w),pocket)
 w.exit={x:Math.floor((pocket.x+20)/4),y:Math.floor((pocket.y+10)/4),w:5,h:5}
 const moved=D.levelTitleLayout(w)
 assert.notDeepEqual(moved,pocket);assert.equal(D.levelTitleOverlap(moved,D.levelTitleKeepClear(w)[1]),0)
 const surface=S.generate(1,0,3);surface.terrain.fill(k.EMPTY)
 for(let x=0;x<k.COLS;x++)surface.terrain[30*k.COLS+x]=k.ROCK
 assert.ok(D.levelTitleCellCost(surface,20,30)>D.levelTitleCellCost(surface,20,29))
 assert.ok(D.levelTitleCellCost(surface,20,29)>D.levelTitleCellCost(surface,20,20))
})
test('cached page cards are crisp, theme aware, bounded and read-only; replay/results draw nothing',()=>{
 const random=Math.random
 try{
  Math.random=()=>{throw Error('title RNG')}
  for(let level=1;level<=20;level++)for(const name of Object.keys(THEMES)){
   const w=S.generate(level,0,3);w.res=2
   const before=JSON.stringify(w),img=canvas(800,496),c=img.ctx,pal=P.build(themeOf(name).theme,level),r=D.levelTitleLayout(w)
   D.clearLayer(c,w);c.fillStyle='#123456';c.globalAlpha=.9
   const fill=c.fillRect.bind(c);let count=0
   c.fillRect=(...v)=>{assert.ok(++count<2500);assert.ok(v.every(n=>Number.isInteger(n*2)));assert.ok(v[2]>0&&v[3]>0);assert.ok(typeof c.fillStyle==='string');fill(...v)}
   D.drawLevelTitleCard(c,w,pal,level-1)
   assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.9);assert.ok(count>100)
   assert.equal(JSON.stringify(w),before)
   const first=hash(img.buf)
   // Context alpha .9 compounds; reset the backing store before comparison.
   const b=canvas(800,496);D.clearLayer(b.ctx,w);b.ctx.globalAlpha=.9;D.drawLevelTitleCard(b.ctx,w,pal,level-1)
   assert.equal(first,hash(b.buf))
   count=0;const boss={...w,bossPost:true,bossName:null};D.drawLevelTitleCard(c,boss,pal,level-1)
   count=0;D.drawLevelTitleCard(c,{...w,done:true},pal,level-1);D.drawLevelTitleCard(c,{...w,replaying:true},pal,level-1);assert.equal(count,0)
   assert.ok(r.height<=36)
  }
 }finally{Math.random=random}
})
test('page intro option removes only the old opening, preserves native intro and results, and changes no simulation digest',()=>{
 const pal=P.build(themeOf('tokyo-night').theme,1)
 const random=Math.random,jitter=seed=>{let n=seed;return()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296)}
 try{for(const res of[1,2]){
  const a=S.generate(1,0,3),b=S.generate(1,0,3);a.res=b.res=res
  for(let tick=0;tick<400;tick++){
   if(tick<40){const img=canvas(400*res,248*res);D.clearLayer(img.ctx,a);D.drawLevelTitleCard(img.ctx,a,pal,0);D.drawLevelTransition(img.ctx,a,pal,{intro:false})}
   Math.random=jitter(tick);S.step(a);Math.random=jitter(tick);S.step(b)
  }
  assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
  const w=S.generate(1,0,3);w.res=res
  const img=canvas(400*res,248*res),blank=hash(img.buf)
  D.drawLevelTransition(img.ctx,w,pal,{intro:false});assert.equal(hash(img.buf),blank)
  D.drawLevelTransition(img.ctx,w,pal);assert.notEqual(hash(img.buf),blank)
  w.done=true;const x=canvas(400*res,248*res),y=canvas(400*res,248*res)
  D.drawLevelTransition(x.ctx,w,pal,{intro:false});D.drawLevelTransition(y.ctx,w,pal);assert.equal(hash(x.buf),hash(y.buf))
 }}finally{Math.random=random}
})
test('page title card fades on wall clock, skips without consuming a tap, excludes replay/report/standup and fits desktop/phone',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'titlecard-ui-'))
 try{
  const r=await captureTitleCards(out)
  assert.deepEqual(r.errors,[],r.exceptions.join("\n"))
  for(const v of r.records){assert.equal(v.hidden,false);assert.equal(v.pageWidth,v.viewport);assert.equal(v.canvas.width,800);assert.equal(v.canvas.height,496);const scale=v.board.width/400,left=v.board.x+v.layout.x*scale;assert.ok(left>=0&&left+(v.layout.width+3)*scale<=v.viewport);assert.equal(v.ticks,18);assert.equal(v.biome,S.BIOMES[(v.level-1)%20]);if(v.mobile){assert.ok(v.board.y>=0&&v.board.y+v.board.height<=v.viewportHeight);assert.ok(v.scrollY>0)}}
  assert.equal(r.records.length,6);const sheet=fs.readFileSync(path.join(out,'phone-sheet.png'));assert.equal(sheet.readUInt32BE(16),414);assert.equal(sheet.readUInt32BE(20),876)
  assert.equal(r.timing.normal.duration,'1.2s');assert.equal(r.timing.normal.pointerEvents,'none');assert.equal(r.timing.normal.ariaHidden,'true');assert.equal(r.timing.normal.hidden,false)
  assert.ok(r.timing.fading>0&&r.timing.fading<1);assert.equal(r.timing.cached,true);assert.equal(r.timing.expired,true);assert.equal(r.timing.pure,true);assert.equal(r.timing.reduced,'0.6s');assert.equal(r.timing.reducedExpired,true);assert.equal(r.timing.reset,true)
  assert.deepEqual(r.input,{skipped:true,resumed:true});assert.deepEqual(r.exclusions.replay,{hidden:true,active:true});assert.equal(r.exclusions.report,true);assert.equal(r.exclusions.meeting.hidden,true);assert.equal(r.exclusions.meeting.done,true);assert.equal(r.exclusions.next,true)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})

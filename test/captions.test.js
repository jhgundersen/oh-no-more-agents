import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf} from '../tools/render.js'
import {captureCaptions} from '../tools/captions.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js')
const hash=b=>createHash('sha256').update(b).digest('hex')

test('caption and native ticker share newest-note selection, seasonal ties and exact age boundaries',()=>{
 const w=S.generate(8,0,3),a={t:20,text:'AGENT 001 IS FIRST HOME'},b={t:30,text:'AGENT 006 · RICOCHET'}
 w.feed=[a,b];w.ticks=29;assert.equal(D.feedNotice(w),null)
 w.ticks=30;assert.equal(D.feedNotice(w),b)
 w.season={note:{t:30,text:'AGENT 001 IS HOME FOR THE HOLIDAYS'}}
 assert.equal(D.feedNotice(w),w.season.note)
 w.season.note.t=29;assert.equal(D.feedNotice(w),b)
 w.ticks=179;assert.equal(D.feedNotice(w),b)
 w.ticks=180;assert.equal(D.feedNotice(w),null)
 w.feed=[];w.season=null;assert.equal(D.feedNotice(w),null)
})
test('page opts out of board-edge prose while default and panel hosts keep their existing art',()=>{
 const pal=P.build(themeOf('tokyo-night').theme,20)
 for(const res of[1,2]){
  const w=S.generate(20,0,3);w.res=res;w.ticks=400;w.feed=[{t:400,text:'AGENT 006 · RICOCHET'}]
  const paint=opts=>{const img=canvas(400*res,248*res);D.clearLayer(img.ctx,w);D.drawLevelTransition(img.ctx,w,pal,{intro:false,...opts});return hash(img.buf)}
  const empty=hash(canvas(400*res,248*res).buf),native=paint({})
  assert.equal(paint({feed:false}),empty)
  assert.equal(paint({feed:true}),native)
  assert.equal(native!==empty,res===2)
 }
})
test('feed presentation reads every biome without touching the world, consuming RNG or leaking canvas state',()=>{
 const random=Math.random
 try{Math.random=()=>{throw Error('caption RNG')}
  for(let level=1;level<=20;level++){
   const w=S.generate(level,0,3);w.res=2;w.ticks=400;w.feed=[{t:380,text:'ON AIR: AGENT 006 HAS BEEN WALKING INTO THIS WALL SINCE TUESDAY'}]
   const before=JSON.stringify(w),img=canvas(800,496),c=img.ctx,pal=P.build(themeOf('tokyo-night').theme,level)
   c.fillStyle='#123456';c.globalAlpha=.8
   D.feedNotice(w);D.drawFeed(c,w,pal)
   assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.8);assert.equal(JSON.stringify(w),before)
  }
 }finally{Math.random=random}
})
test('live captions fit desktop/phone/landscape and seasons; wall time, pause, navigation and replay stay coherent',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'captions-test-'))
 try{
  const report=await captureCaptions(out,{checks:true})
  assert.deepEqual(report.errors,[])
  for(const r of report.records){
   assert.equal(r.pageWidth,r.width,r.name)
   assert.ok(r.caption.x>=0&&r.caption.x+r.caption.width<=r.width)
   assert.ok(r.caption.y>=r.board.y+r.board.height,'outside the board')
   assert.ok(parseFloat(r.caption.font)>=11)
   assert.equal(r.caption.hidden,'false');assert.equal(r.caption.live,'off')
   assert.ok(r.caption.text.length>0)
   assert.equal(r.caption.text,(r.season&&r.season.t>=r.feed.t?r.season:r.feed).text)
   assert.ok(r.caption.textBox.y>=r.caption.y&&r.caption.textBox.y+r.caption.textBox.height<=r.caption.y+r.caption.height)
   if(r.width<1000){assert.ok(r.stage.y+r.stage.height<=r.height+1,'game fits '+r.name);assert.ok(r.board.y+r.board.height<=r.height)}
  }
  const c=report.lifecycle
  assert.equal(c.first,'AGENT 006 · UMBRELLA SAVE');assert.equal(c.at4900,c.first);assert.equal(c.fastForward,c.first)
  assert.equal(c.expired,'');assert.equal(c.paused,'AGENT 006 · RICOCHET')
  assert.equal(c.season,'AGENT 001 IS HOME FOR THE HOLIDAYS')
  assert.equal(c.replay,'');assert.equal(c.report,'');assert.equal(c.navigation,'')
  assert.equal(c.rewrites,0);assert.equal(c.readOnly,true);assert.equal(c.longFits,true)
  assert.equal(c.live,'off');assert.equal(c.role,'note')
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf} from '../tools/render.js'
import {captureHeroIntros,HERO_VIEWS} from '../tools/hero-intros.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js')
const hash=b=>createHash('sha256').update(b).digest('hex')

test('hero introductions retain complete canonical names/facts, wrap picks, and handle absent biographies',()=>{
 assert.equal(D.skyCardCaption(null),'');assert.equal(D.skyCardCaption({}),'')
 assert.equal(D.skyCardCaption({special:'sapper'}),'');assert.equal(D.skyCardCaption({specialSpec:S.specialSpec('sapper')}),'')
 let total=0
 for(const sp of S.SPECIALS){
  const facts=D.SPECIAL_FACTS[sp.id]||['']
  for(let pick=0;pick<facts.length;pick++){
   const w={special:sp.id,specialSpec:sp,factPick:pick},expected=sp.name+(facts[pick]?' · '+facts[pick]:'')
   assert.equal(D.skyCardCaption(w),expected)
   assert.equal(D.skyCardCaption({...w,factPick:pick+facts.length}),expected)
   assert.ok(D.wrapReportText(expected,42).length<=2,'preflight 360px copy length');total++
  }
 }
 assert.equal(total,231)
 assert.equal(D.skyCardCaption({special:'submarine',specialSpec:S.specialSpec('submarine')}),'Deep Learning')
 assert.equal(D.skyCardCaption({special:'sapper',specialSpec:S.specialSpec('sapper'),factPick:1}),'Prompt Injection · was told to be helpful, harmless and honest. Two of three.')
})

test('introduction selection consumes no RNG, changes no world, and leaves both original sky renderings exact',()=>{
 const random=Math.random
 try{
  Math.random=()=>assert.fail('hero caption used RNG')
  for(let level=1;level<=20;level++)for(const res of[1,2]){
   const w=S.generate(level,0,3);w.res=res;const before=hash(JSON.stringify(w));D.skyCardCaption(w);assert.equal(hash(JSON.stringify(w)),before)
  }
  const refs={1:'57e1e597fdaec2a13feb5bf08f26a2a3b36179184db39108fe363a9ba8243341',2:'8f0d52c0776969e78a65a37dc60100bf6cbe79b628e405bf244a0cf7a3f14048'}
  for(const res of[1,2]){
   const w=S.generate(9,0,3);Object.assign(w,{res,ticks:200,events:[],stoodDownAt:-1,mission:null,special:'sapper',specialSpec:S.specialSpec('sapper'),factPick:1})
   const img=canvas(400*res,248*res);D.clearLayer(img.ctx,w);D.drawSpecialCard(img.ctx,w,P.build(themeOf('tokyo-night').theme,9));assert.equal(hash(img.buf),refs[res])
  }
 }finally{Math.random=random}
})

test('actual-size hero captions fit all biographies and preserve event, pause, report, replay and navigation priority',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'hero-intros-'))
 try{
  const report=await captureHeroIntros(out,{checks:true});assert.deepEqual(report.errors,[]);assert.equal(report.records.length,6)
  for(const r of report.records){
   assert.ok(HERO_VIEWS.some(v=>v.name===r.name));assert.equal(r.pageWidth,r.width)
   assert.equal(r.caption.text,r.scale===1?r.expected:'');assert.ok(r.expected.startsWith(r.heroName));assert.equal(r.caption.hidden,r.scale===1?'false':'true')
   assert.equal(r.caption.font,'12px');assert.equal(r.caption.live,'off');assert.equal(r.caption.label,'Colony commentary')
   assert.ok(r.caption.x>=0&&r.caption.x+r.caption.width<=r.width);assert.ok(r.caption.y>=r.board.y+r.board.height)
   const a=r.caption,b=a.textBox;if(r.scale===1){assert.ok(b.y>=a.y&&b.y+b.height<=a.y+a.height);assert.ok(b.x>=a.x&&b.x+b.width<=a.x+a.width)}
   if(r.width===390||r.name==='hero-landscape')assert.ok(r.stage.y+r.stage.height<=r.height+1)
  }
  const c=report.lifecycle;assert.deepEqual(c.fitting,{total:231,failures:[],width:336,height:30})
  assert.equal(c.cache.calls,1);assert.equal(c.cache.rewrites,0);assert.equal(c.cache.readOnly,true);assert.equal(c.cache.noHero,'');assert.equal(c.cache.stageHeight,c.cache.noHeroHeight);assert.equal(c.resizeReadOnly,true);assert.deepEqual(c.resize,[{scale:2,text:''},{scale:1,text:c.cache.text}])
  assert.equal(c.first,'AGENT 006 · UMBRELLA SAVE');assert.equal(c.at4900,c.first);assert.equal(c.fastForward,c.first)
  assert.equal(c.profile,c.cache.text);assert.equal(c.expired,c.profile);assert.equal(c.paused,'AGENT 006 · RICOCHET')
  assert.equal(c.season,'AGENT 001 IS HOME FOR THE HOLIDAYS');assert.equal(c.replay,'');assert.equal(c.report,'Report held · Space or tap to resume')
  assert.equal(c.navigation,c.nextProfile);assert.equal(c.rewrites,0);assert.equal(c.readOnly,true);assert.equal(c.longFits,true)
  assert.equal(c.live,'off');assert.equal(c.role,'note')
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})

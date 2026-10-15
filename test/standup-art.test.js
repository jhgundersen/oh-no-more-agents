import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf} from '../tools/render.js'
import {captureStandups} from '../tools/standup-art.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js'),O=loadCore('Outcome.js')
const hash=b=>createHash('sha256').update(b).digest('hex')
const recap={agiHome:1,agiLost:1,hallucinations:1,ducked:1,rateLimited:1,pitDeaths:1,hazardKills:99,blocker:1,brolly:99,builder:1,events:1}
const lines=O.standupLines(recap,16)
const speakers=()=>['steady','dreamer','brave','wary','herd'].map((trait,i)=>({id:i+1,trait,agi:i===1,lines:O.standupLines({agiHome:1,hallucinations:1,pitDeaths:1,ducked:1,rateLimited:1},5)[i]}))

test('native standup frames and default cadence remain exact; page turns share precise boundaries',()=>{
 const w=S.generate(6,0,3),pal=P.build(themeOf('tokyo-night').theme,6)
 const refs={1:'d108254332b1dd60eec260b19e2f913401339e6d3465da74c7b5419497ef057f',13:'121c8275a3ec179aa816dccbd818a1f719524c3a4ccae9ea61775f84f656d7b3',47:'a11653218fc8743206fd53cae005b1d6f2215017978867580428d801229c7b4a',149:'bf3720d29d802f8f7b1560e66549f82984f55d3a2bb6019af1857058639d79c7'}
 for(const res of[undefined,1])for(const[t,ref]of Object.entries(refs)){
  const img=canvas(400,248);D.drawStandup(img.ctx,{...w,res},pal,{t:+t,speakers:speakers()});assert.equal(hash(img.buf),ref)
 }
 for(const res of[undefined,1,2])for(let n=1;n<=5;n++){
  const turn=D.standupTurn(res);assert.equal(turn,res===2?80:34)
  assert.equal(D.standupLength(n,res),12+n*turn);assert.equal(D.standupSpeaker(11,res),-1)
  for(let i=0;i<n;i++){assert.equal(D.standupSpeaker(12+i*turn,res),i);assert.equal(D.standupSpeaker(12+(i+1)*turn-1,res),i)}
  assert.equal(D.standupSpeaker(D.standupLength(n,res),res),n)
 }
 assert.equal(D.standupLength(5,2)*30,12360);assert.equal(D.standupLength(5)*30,5460)
})

test('all standup copy fits larger bubbles, keeps the kanban and 360px crop clear, and preserves context',()=>{
 const pal=P.build(themeOf('tokyo-night').theme,6),random=Math.random
 try{
  Math.random=()=>assert.fail('standup art consumed RNG')
  for(const speech of lines)for(const x of[124,143,170,197,216]){
   const b=D.pageStandupBubbleLayout(x,150,speech,400,169),img=canvas(800,496),c=img.ctx
   assert.ok(b.x>=24&&b.x+b.width<=304,'clear of board edges and kanban')
   assert.ok(b.y>=30&&b.y+b.height+3<=169,'clear of heading and feet')
   assert.ok(x>=b.x&&x<=b.x+b.width,'pointer names its speaker')
   for(const line of speech)assert.ok(line.length*8-2<=b.width-16)
   let calls=0;const fill=c.fillRect.bind(c);c.fillRect=(...r)=>{assert.ok(++calls<2200);assert.ok(r.every(v=>Number.isInteger(v*2)),'half-pixel grid');assert.ok(r[0]>=b.x&&r[0]+r[2]<=b.x+b.width);assert.ok(r[1]>=b.y&&r[1]+r[3]<=149);fill(...r)}
   c.fillStyle='#123456';c.globalAlpha=.8;D.drawPageStandupBubble(c,pal,x,150,speech,400,7,2,5,169)
   assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.8)
  }
  for(let level=1;level<=20;level++){
   const w=S.generate(level,0,3);w.res=2;const s={t:12+(level%5)*80+1,speakers:speakers()},before=hash(JSON.stringify({w,s})),img=canvas(800,496)
   D.drawStandup(img.ctx,w,P.build(themeOf('tokyo-night').theme,level),s)
   assert.equal(hash(JSON.stringify({w,s})),before,'standup never changes its world or speakers')
  }
 }finally{Math.random=random}
})

test('standup copy and headings retain readable contrast in every page theme',()=>{
 const themes=vm.runInNewContext('('+fs.readFileSync(new URL('../public/agents/web.js',import.meta.url),'utf8').match(/var THEMES = (\{[\s\S]*?\n  \})/)[1]+')')
 const lum=s=>{const a=(s[0]==='#'?[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)):s.match(/[0-9.]+/g).slice(0,3).map(Number)).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722}
 const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05)
 assert.ok(contrast(D.GAG_INK,D.GAG_PAPER)>=7)
 for(const t of Object.values(themes)){
  const p=P.build(Object.fromEntries(Object.entries(t).map(([k,v])=>[k,P.hex(v)])),6)
  assert.ok(contrast(p.label,p.hatchMouth)>=4.5);assert.ok(contrast(D.GAG_PAPER,p.rockShade)>=4.5)
 }
})

test('real standups fit desktop/phone/360/landscape, synchronize page timing and audio, and remain tappable',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'standup-art-'))
 try{
  const report=await captureStandups(out,{checks:true});assert.deepEqual(report.errors,[])
  for(const r of report.records){
   assert.equal(r.pageWidth,r.width);assert.equal(r.turn,80);assert.equal(r.talking,r.index)
   assert.equal(r.panels.length,1);const panel=r.panels[0],scale=r.board.width/400
   assert.ok(r.board.x+panel.x*scale>=0);assert.ok(r.board.x+(panel.x+panel.width)*scale<=r.width)
   const body=r.text.filter(t=>/^(YESTERDAY:|TODAY:|BLOCKERS:)/.test(t.str));assert.equal(body.length,3)
   assert.deepEqual(body.map(t=>t.str),r.speakers[r.index].lines);assert.ok(body.every(t=>t.size===2))
   assert.ok(r.text.some(t=>t.str==='AGENT '+('00'+r.speakers[r.index].id).slice(-3)+' · '+(r.index+1)+'/'+r.speakers.length))
   assert.ok(r.text.some(t=>t.str==='TAP OR CLICK TO SKIP'&&t.size===2))
   assert.equal(r.reduced,r.name==='nord-reduced')
  }
  assert.deepEqual(report.lifecycle,{turn:80,intro:true,first:0,last:0,speed:[0,0,0],readOnly:true,cuesBefore:1,cuesAfter:1,ended:6,tapped:true})
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})

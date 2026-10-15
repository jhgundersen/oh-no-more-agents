import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf} from '../tools/render.js'
import {setupReport,captureReports} from '../tools/report-art.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js')
const hash=b=>createHash('sha256').update(b).digest('hex')
const make=(kind='busy',level=18)=>setupReport(S.generate(level,0,3),kind)
const pal=P.build(themeOf('tokyo-night').theme,18)
function recorded(w,p){
 const img=canvas(800,496),c=img.ctx,l=D.pageReportLayout(w,p),left=200-l.width/2,stack=[]
 let m=[1,1,0,0],calls=0
 for(const name of['save','restore','translate','scale']){
  const old=c[name].bind(c);c[name]=(...a)=>{
   if(name==='save')stack.push(m.slice())
   if(name==='restore')m=stack.pop()
   if(name==='translate'){m[2]+=a[0]*m[0];m[3]+=a[1]*m[1]}
   if(name==='scale'){m[0]*=a[0];m[1]*=a[1]}
   old(...a)
  }
 }
 c.scale(2,2);m=[1,1,0,0]
 const fill=c.fillRect.bind(c)
 c.fillRect=(x,y,a,b)=>{
  assert.ok(++calls<10000,'bounded glyph count');const r=[x*m[0]+m[2],y*m[1]+m[3],a*m[0],b*m[1]]
  assert.ok(r.every(Number.isFinite));assert.ok(r.every(n=>Number.isInteger(n*2)))
  assert.ok(r[0]>=left&&r[0]+r[2]<=left+l.width+3,'ink inside plate width')
  assert.ok(r[1]>=l.y&&r[1]+r[3]<=l.y+l.height+3,'ink inside plate height')
  fill(x,y,a,b)
 }
 const before=hash(JSON.stringify(w)),random=Math.random;c.fillStyle='#123456';c.globalAlpha=.8
 try{Math.random=()=>assert.fail('report used RNG');D.drawLevelTransition(c,w,p,{intro:false,feed:false})}finally{Math.random=random}
 assert.equal(hash(JSON.stringify(w)),before);assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.8);assert.deepEqual(m,[1,1,0,0]);assert.equal(stack.length,0)
 return{img,calls}
}
test('native report pixels stay identical for zero, all-home and every busy report row',()=>{
 const refs={zero:'07c04df6e4bf562ad2caee5583e0ecdb05376af6033ddc1e399b22773d1d4191',all:'779ee3f65688f2894f040e5aaac08aa15b86e6eb5dc04699c485f63d8659352b',busy:'03831fb62e1160d72190e92f1817bff957a7880b4458e4c53292eda8d3d1cbf1'}
 for(const [kind,ref]of Object.entries(refs))for(const res of[undefined,1]){const w=make(kind);w.res=res;const a=canvas(400,248);D.drawLevelResults(a.ctx,w,pal);assert.equal(hash(a.buf),ref)}
})
test('wrapping keeps every word, breaks long tokens, and uses the biggest font that fits the complete report',()=>{
 assert.deepEqual(D.wrapReportText('ONE TWO THREE',7),['ONE TWO','THREE'])
 assert.deepEqual(D.wrapReportText('ABCDEFGHI',4),['ABCD','EFGH','I']);assert.deepEqual(D.wrapReportText('',4),[])
 for(const kind of['zero','all','busy'])for(const season of[null,{homePrefix:'HO HO HOME: ',homeSuffix:''},{homePrefix:'TRICK OR TREAT: '}]){
  const w=make(kind);w.res=2;w.season=season
  for(const age of[0,5,10,100]){
   w.doneTicks=age;const l=D.pageReportLayout(w,pal),rows=D.reportRows(w,pal)
   assert.ok(l.y>=4&&l.y+l.height+3<=248);assert.equal(l.rows.length,rows.length);assert.ok(l.size>=1.5)
   for(let i=0;i<rows.length;i++){
    const r=l.rows[i];if(rows[i].text){assert.equal(r.lines.join(' '),rows[i].text);for(const line of r.lines)assert.ok((line.length*4-1)*l.size<=l.width-24)}
    else assert.equal(!!r.escort,!!rows[i].escort)
   }
   assert.ok((D.homeTitle(w).length*4-1)*l.titleSize<=l.width-24)
  }
 }
 assert.equal(D.pageReportLayout(make('all'),pal).size,2);assert.equal(D.pageReportLayout(make('busy'),pal).size,1.5)
})
test('roomy reports stay on a half-pixel grid and preserve state, RNG and context in all biomes and page themes',()=>{
 for(let level=1;level<=20;level++){const w=make(level%2?'busy':'all',level);w.res=2;w.doneTicks=level%11;recorded(w,P.build(themeOf('tokyo-night').theme,level))}
})
test('report copy uses readable existing inks in all nine page themes',()=>{
 const themes=vm.runInNewContext('('+fs.readFileSync(new URL('../public/agents/web.js',import.meta.url),'utf8').match(/var THEMES = (\{[\s\S]*?\n  \})/)[1]+')')
 const lum=s=>{const a=(s[0]==='#'?[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)):s.match(/[0-9.]+/g).slice(0,3).map(Number)).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return a[0]*.2126+a[1]*.7152+a[2]*.0722}
 assert.equal(Object.keys(themes).length,9)
 for(const t of Object.values(themes)){
  const p=P.build(Object.fromEntries(Object.entries(t).map(([k,v])=>[k,P.hex(v)])),18),w=make(),a=lum(p.cardBack),inks=[p.label,p.fireHot,p.exitLight,...D.reportRows(w,p).filter(r=>r.text).map(r=>D.pageReportInk(p,r.colour))]
  for(const ink of inks){const b=lum(ink),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,ink+' '+ratio)}
  w.res=2;recorded(w,p)
 }
})
test('seasonal decorations leave page report pixels clear while native Halloween props remain',()=>{
 const source=fs.readFileSync(new URL('../public/agents/season.js',import.meta.url),'utf8')
 for(const name of['halloween','christmas'])for(const res of[1,2]){
  const scope={window:{location:{search:'?season='+name}},Date,Math,Object,String};vm.runInNewContext(source,scope)
  const api=scope.window.AgentSeason,w=make('all',19);w.res=res;api.dress(w)
  const img=canvas(400*res,248*res);img.ctx.scale(res,res);let calls=0
  const fill=img.ctx.fillRect.bind(img.ctx);img.ctx.fillRect=(...a)=>{assert.ok(++calls<10000);fill(...a)}
  D.drawLevelResults(img.ctx,w,pal);const before=hash(img.buf);calls=0;api.paint(img.ctx,w)
  if(res===2||name==='christmas'){assert.equal(calls,0);assert.equal(hash(img.buf),before)}
  else assert.ok(calls>0,'native Halloween decorations retain their original path')
 }
})
test('real-size report evidence fits 390/360 phones, landscape and desktop with every full-house fact retained',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'report-art-'))
 try{
  const r=await captureReports(out);assert.deepEqual(r.errors,[]);assert.equal(r.records.length,6)
  for(const s of r.records){
   assert.equal(s.pageWidth,s.width,s.name);assert.ok(s.layout);const l=s.layout,b=s.board,scale=b.width/400,left=b.x+(400-l.width)/2*scale
   assert.ok(left>=0&&left+(l.width+3)*scale<=s.width,s.name+' whole report visible')
   assert.ok(l.y>=4&&l.y+l.height+3<=248);assert.equal(s.sourceRows.length,l.rows.length)
   if(s.width===390||s.name.startsWith('landscape'))assert.ok(s.stage.y+s.stage.height<=s.height+1,'controls still fit '+s.name)
  }
  assert.equal(r.records.find(s=>s.name==='full-house').layout.size,1.5)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})

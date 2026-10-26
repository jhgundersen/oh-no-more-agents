import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {captureAudio,liveAudio} from '../tools/biome-audio.js'
const hash=b=>createHash('sha256').update(b).digest('hex')
test('real WebAudio renders quiet seamless distinct beds, leaves headroom for cues and exports finite WAV previews',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'biome-audio-'))
 try{
  const r=await captureAudio(out);assert.deepEqual(r.errors,[]);assert.equal(r.records.length,26)
  const shapes=new Set()
  for(const a of r.records){
   assert.ok(Number.isFinite(a.rms)&&Number.isFinite(a.peak)&&Number.isFinite(a.buildMs));assert.equal(a.samples,108000)
   const wav=fs.readFileSync(path.join(out,a.name+'.wav'));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.length,216044);assert.equal(wav.readUInt32LE(24),12000)
   if(!a.name.endsWith('-after')){
    assert.ok(a.rms>.0005&&a.rms<.0021,a.name+' volume');assert.ok(a.peak<.02,a.name+' headroom');assert.ok(a.seamJump<.00001,a.name+' seam')
    assert.equal(hash(wav.subarray(44+12000,44+24000)),hash(wav.subarray(44+204000,44+216000)),a.name+' cached loop repeats exactly')
    shapes.add(hash(wav))
   }else{assert.ok(a.peak<.08,a.name+' cues never clip');assert.ok(a.peak>.04,a.name+' cues stay foreground')}
  }
  assert.equal(shapes.size,20)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
test('live page keeps sound opt-in, respects pause/visibility/mute/report, and preserves the bed across every speed',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'biome-audio-page-'))
 try{
  const r=await liveAudio(out);assert.deepEqual(r.errors,[])
  const by=Object.fromEntries(r.states.map(x=>[x.name,x]))
  assert.equal(by['default-off'].on,false);assert.equal(by['default-off'].contexts,0)
  for(const name of['enabled','resumed','visible','unmuted','next-biome']){assert.equal(by[name].live,1,name);assert.equal(by[name].open,1,name);assert.equal(by[name].contexts,1)}
  for(const name of['paused','hidden','muted','report','commuting']){assert.equal(by[name].live,0,name);assert.equal(by[name].open,0,name)}
  const speeds=new Set()
  for(let i=0;i<3;i++){const s=by['speed-'+i];assert.equal(s.live,1);assert.equal(s.bedBuffers,1);speeds.add(s.speed)}
  assert.equal(speeds.size,3);assert.equal(by['next-biome'].biome,'Subway');assert.equal(r.cleanup.closed,r.cleanup.sources)
  assert.ok(r.cleanup.gainsClosed>=r.cleanup.closed)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})

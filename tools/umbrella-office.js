#!/usr/bin/env node
// One seek per biome; reuse terrain and draw actors directly into small crops.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels} from './gag-art.js'
import {arrivalWorld} from './exit-welcome.js'
import {sheetLabel} from './art-label.js'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),P=load('Palette.js'),sha=x=>createHash('sha256').update(x).digest('hex')
export const OFFICE_COUNTS=[0,1,3,5,10,20]
export const OFFICE_SEASONS={none:null,halloween:{bat:'#2a2233',batEvery:3},christmas:{candy:'#d42a3c',candyEvery:3}}
export function officeBox(w){return{x:Math.max(0,Math.min(272,Math.round((w.exit.x+w.exit.w/2)*4)-64)),y:Math.max(0,Math.min(184,(w.exit.y+w.exit.h)*4-48)),width:128,height:64}}
export function officeFrame(D,w,cache={},theme='tokyo-night'){
 const res=w.res||1,box=officeBox(w),pal=P.build(themeOf(theme).theme,w.level),key=[w.terrainVersion,res,theme,w.season?.bat,w.season?.candy].join(':')
 if(w.season?.bat)pal.decorLit='#ff8a1e';if(w.season?.candy)pal.decorLit='#e0314b'
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function officeRow(out,D,old,level,season){
 const w=arrivalWorld(level),actual={tick:w.ticks,saved:w.saved,homeOrder:w.homeOrder.slice()},sheet=canvas(1536,300,'#121822'),caches=[{},{}]
 w.season=OFFICE_SEASONS[season];const layout=D.umbrellaOfficeLayout(w)
 // Illustrative stock counts freeze one real arrival scene; never claim this
 // is a simulation of twenty arrivals. Browser evidence uses real saved totals.
 for(const[i,count]of OFFICE_COUNTS.entries()){
  w.saved=count
  for(const[k,draw]of[old,D].entries())copyPixels(sheet,officeFrame(draw,w,caches[k]),i*256,28+k*136)
  sheet.ctx.fillStyle='#e6e9ee';sheetLabel(sheet.ctx,D,`${count} HOME`,i*256+128,9)
 }
 const file=`${level}-${season}-stocks.png`;writePNG(path.join(out,file),sheet)
 return {level,biome:w.biome,season,actual,layout,file,SHA256:sha(fs.readFileSync(path.join(out,file)))}
}
function officeHTML(rows,name){
 return `<!doctype html><meta charset="utf-8"><title>Lost-umbrella office</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}a{color:#7aa2f7}img{image-rendering:pixelated;max-width:100%}.stocks{width:1536px}.phone{width:768px}section{margin:32px 0}</style><h1>The lost-umbrella office</h1><p><a href="${name}">All biomes, before / after</a> · <a href="manifest.json">Source/image hashes</a></p><p>Each strip: 0, 1, 3, 5, 10, 20 home; before above, after below. These are illustrative counts over a frozen real first-arrival scene. The collection caps at ten (five on a narrow ledge). Full browser screenshots use actual saves.</p>${rows.map(r=>`<section><h2>${r.biome} · ${r.season}</h2><p>Desktop board scale:</p><img class="stocks" src="${r.file}"><p>Phone board scale:</p><img class="phone" src="${r.file}"></section>`).join('')}`
}
export function officeReview(out,{base='2b12360',levels=Array.from({length:20},(_,i)=>i+1),seasons=Object.keys(OFFICE_SEASONS)}={}){
 const started=performance.now(),source=fs.readFileSync(path.join(ROOT,'public/agents/Draw.js')),oldSource=execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}),D=load('Draw.js'),old=renderer(oldSource.toString()),rows=[]
 fs.mkdirSync(out,{recursive:true})
 const sheet=canvas(800,160*levels.length+24,'#121822')
 for(const[row,level]of levels.entries()){
  for(const season of seasons)rows.push(officeRow(out,D,old,level,season))
  const w=arrivalWorld(level);w.saved=10;sheet.ctx.fillStyle='#e6e9ee';sheetLabel(sheet.ctx,D,w.biome+' - BEFORE / AFTER',400,10+row*160)
  copyPixels(sheet,officeFrame(old,w),72,30+row*160);copyPixels(sheet,officeFrame(D,w),472,30+row*160)
 }
 const stamp=sha(Buffer.concat([source,oldSource,fs.readFileSync(fileURLToPath(import.meta.url)),Buffer.from(JSON.stringify({levels,seasons}))])).slice(0,8),name=`contact-sheet-${stamp}.png`
 writePNG(path.join(out,name),sheet);writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),officeHTML(rows,name))
 const result={base,beforeSHA256:sha(oldSource),drawSHA256:sha(source),contactSheet:name,contactSHA256:sha(fs.readFileSync(path.join(out,name))),counts:OFFICE_COUNTS,rows,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(officeReview(path.resolve(process.argv[2]||'shots/umbrella-office'))))

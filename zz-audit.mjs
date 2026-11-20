import { readFileSync, readdirSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

function decode(buf) {
  let w=0,h=0,bitDepth=0,colorType=0; const idat=[]
  let off=8
  while (off+12<=buf.length) {
    const len=buf.readUInt32BE(off), type=buf.toString('ascii',off+4,off+8)
    const data=buf.subarray(off+8,off+8+len)
    if (type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);bitDepth=data[8];colorType=data[9]}
    else if (type==='IDAT') idat.push(data)
    else if (type==='IEND') break
    off+=12+len
  }
  const raw=inflateSync(Buffer.concat(idat))
  const ch=colorType===6?4:3, bpp=ch, stride=w*bpp
  const out=Buffer.alloc(w*h*4); let prev=Buffer.alloc(stride)
  for (let y=0;y<h;y++){
    const ft=raw[y*(stride+1)]; const line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1))
    const cur=Buffer.alloc(stride)
    for (let x=0;x<stride;x++){
      const a=x>=bpp?cur[x-bpp]:0, b=prev[x], c=x>=bpp?prev[x-bpp]:0
      let v=line[x]
      if (ft===1)v+=a; else if (ft===2)v+=b; else if (ft===3)v+=(a+b)>>1
      else if (ft===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=(pa<=pb&&pa<=pc)?a:(pb<=pc?b:c)}
      cur[x]=v&255
    }
    for (let x=0;x<w;x++){const o=(y*w+x)*4
      out[o]=cur[x*bpp]; out[o+1]=cur[x*bpp+1]; out[o+2]=cur[x*bpp+2]; out[o+3]=ch===4?cur[x*bpp+3]:255}
    prev=cur
  }
  return {w,h,rgba:out}
}

const dir='tests/visual-baselines'
const rows=[]
for (const f of readdirSync(dir).filter(x=>x.endsWith('.png')).sort()) {
  const {w,h,rgba}=decode(readFileSync(`${dir}/${f}`))
  // Count non-background pixels per horizontal band to find a blank tail.
  const bg=[rgba[0],rgba[1],rgba[2]]
  const bandH=Math.floor(h/24)
  let blankBands=0, lastContentY=0
  for (let b=0;b<24;b++){
    let ink=0
    for (let y=b*bandH;y<Math.min(h,(b+1)*bandH);y+=4)
      for (let x=0;x<w;x+=4){const o=(y*w+x)*4
        if (Math.abs(rgba[o]-bg[0])>12||Math.abs(rgba[o+1]-bg[1])>12||Math.abs(rgba[o+2]-bg[2])>12){ink++;break}}
    if (ink<3) blankBands++; else lastContentY=(b+1)*bandH
  }
  rows.push({f,w,h,blankBands,lastContentY,blankPercent:Math.round(lastContentY/h*100)})
}
console.log(rows.map(r=>`${r.f.padEnd(34)} ${r.w}x${r.h} content-to-${r.blankPercent}% blankBands=${r.blankBands}`).join('\n'))
const bad=rows.filter(r=>r.blankPercent<40 || r.blankBands>10)
console.log('\nsuspect (mostly blank):', bad.length, bad.map(b=>b.f).join(', '))

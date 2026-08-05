// model-check.mjs — load AND render every shipped GLB in a real browser.
//
//   node tools/model-check.mjs        (npm run check:models)
//
// WHY THIS EXISTS: four models sat broken in the repo without anything noticing. Two failed to
// PARSE ("Cannot read properties of null (reading 'array')") and two parsed but threw on every
// frame once uploaded to the GPU ("isGLBufferAttribute"). Both were caused by an old compression
// pipeline that ran `gltf-transform optimize`, whose extra passes corrupt rigged/animated models.
//
// Neither failure was visible: world.js catches a load failure and quietly keeps the procedural
// stand-in, so a broken enemy just never appears, and a render failure only shows up as console
// spam. The engine tests cannot catch either — they have no WebGL — so this is a browser check.
//
// RENDERING TWICE IS THE POINT. A corrupt attribute only throws when three actually uploads it
// to the GPU, which does not happen on the frame the model is added.

import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.wasm':'application/wasm'};
const srv=http.createServer((q,s)=>{let p=path.join(ROOT,'public',decodeURIComponent(q.url.split('?')[0]));
 try{const b=fs.readFileSync(p);s.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404);s.end('nf');}});
await new Promise(r=>srv.listen(8097,r));
fs.writeFileSync(path.join(ROOT,'public','_scan.html'),`<canvas id=c></canvas>
<script src="./vendor/three.min.js"></script><script src="./vendor/GLTFLoader.js"></script><script src="./vendor/DRACOLoader.js"></script>
<script>
const R=new THREE.WebGLRenderer({canvas:document.getElementById('c')});R.setSize(64,64);
const S=new THREE.Scene(), C=new THREE.PerspectiveCamera(50,1,0.1,100); C.position.set(0,2,6);
const dl=new THREE.DRACOLoader(); dl.setDecoderPath('./vendor/draco/'); dl.setDecoderConfig({type:'js'});
window.probe=(url)=>new Promise(res=>{
  const l=new THREE.GLTFLoader(); l.setDRACOLoader(dl);
  l.load(url, g=>{
    try{
      S.add(g.scene);
      // render twice — a broken attribute only throws when the GPU actually uploads it
      R.render(S,C); R.render(S,C);
      S.remove(g.scene);
      res({ok:true, anims:g.animations.length});
    }catch(e){ S.remove(g.scene); res({ok:false, where:'render', err:String(e.message)}); }
  }, undefined, e=>res({ok:false, where:'load', err:String(e&&e.message)}));
});
</script>`);
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await br.newPage({viewport:{width:64,height:64}});
await pg.goto('http://localhost:8097/_scan.html');
await pg.waitForFunction(()=>window.probe);
const dirs=['assets/models','assets/buildings'];
const bad=[];
for (const d of dirs){
  const dir=path.join(ROOT,'public',d); if(!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.glb'))){
    const r = await pg.evaluate(u=>window.probe(u), './'+d+'/'+f);
    if(!r.ok){ bad.push([d+'/'+f, r.where, r.err]); console.log('BAD ', f, r.where, r.err); }
  }
}
console.log(bad.length ? `\n\u2717 ${bad.length} broken model(s)` : `\n\u2714 ${dirs.length} dirs: every model loads and renders`);
await br.close(); srv.close(); fs.unlinkSync(path.join(ROOT,'public','_scan.html'));
process.exit(bad.length ? 1 : 0);

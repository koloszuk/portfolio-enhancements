import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/backgrounds/dot-grid.js',import.meta.url),'utf8').replaceAll('export ','');
function fixture({editor=false,backplane=false}={}) {
  const frames=new Map(), observers=[];let next=0;
  function node({color='rgba(0, 0, 0, 0)',image='none',pinned=false}={}) {
    const values=new Map(),attrs=new Map(),classes=new Set();
    return {color,image,isConnected:true,children:[],pinned,
      style:{getPropertyValue:k=>values.get(k)||'',getPropertyPriority:()=>'',setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)},
      classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)},
      getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
      matches:()=>pinned,querySelectorAll(){return this.contents||[];},
      prepend(child){child.parent=this;this.children.unshift(child);},
      remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(c=>c!==this);},
    };
  }
  const root=node(),body=node({color:'rgb(230, 230, 230)'});
  const page=node({color:'rgb(240, 230, 220)'}), content=node({color:'rgb(210, 220, 230)'});
  page.contents=[content]; const header=node({pinned:true}),footer=node({pinned:true});
  let pages=[page,header,footer],enabled='1';
  const window=Object.assign(new EventTarget(),{top:{location:{pathname:editor?'/edit/home':'/'}}});
  const document=Object.assign(new EventTarget(),{documentElement:root,body,querySelector:()=>null,
    querySelectorAll:()=>pages,createElement:()=>node()});
  const context={window,document,location:{pathname:editor?'/edit/home':'/'},
    getComputedStyle:n=>({backgroundColor:n===root&&root.getAttribute('data-dan-canvas-color')?root.style.getPropertyValue('--dan-cargo-site-color'):n.color,backgroundImage:n.image,getPropertyValue:k=>k==='--ENABLE_FIXED_BACKPLANE_EXPERIMENT'?(root.style.getPropertyValue(k)||(backplane?'1':'0')):k==='--ENABLE_BACKGROUND_PATTERN'?enabled:k==='--PATTERN_TYPE'?'dots':k==='--site-background-color'?(root.siteColor||''):''}),
    MutationObserver:class{constructor(cb){this.cb=cb;observers.push(this);}observe(){}disconnect(){}},
    requestAnimationFrame:cb=>{frames.set(++next,cb);return next;},cancelAnimationFrame:id=>frames.delete(id),
  };
  vm.runInNewContext(source+'\nthis.mount=mountGlobalBackground;this.opaque=isOpaqueBackground;',context);
  const instance=context.mount();
  function flush(){const batch=[...frames.values()];frames.clear();for(const cb of batch)cb();}
  return {root,body,page,content,header,footer,instance,flush,context,frames,
    rescan(){observers[0].cb();flush();},setEnabled:v=>{enabled=v;},
    navigate(){page.isConnected=false;content.isConnected=false;const future=node();future.contents=[];pages=[future,header,footer];return future;},
  };
}
test('global site and opaque local surfaces receive one layer; pinned backgrounds stay untouched',()=>{
  const f=fixture();f.flush();
  for(const node of [f.body,f.page,f.content]) assert.equal(node.children.length,1);
  assert.equal(f.header.children.length,0);assert.equal(f.footer.children.length,0);
  f.rescan();for(const node of [f.body,f.page,f.content])assert.equal(node.children.length,1);
  assert.equal(f.frames.size,0);
  assert.equal(f.root.style.getPropertyValue('--dan-cargo-site-color'),f.body.color);
  assert.equal(f.page.style.getPropertyValue('background-color'),'');
});
test('navigation removes stale layers and transparent future pages share the site pattern',()=>{
  const f=fixture();f.flush();const future=f.navigate();f.rescan();
  assert.equal(f.page.children.length,0);assert.equal(f.content.children.length,0);
  assert.equal(f.body.children.length,1);assert.equal(future.children.length,0);
  f.body.color='rgb(100, 120, 140)';f.rescan();
  assert.equal(f.root.style.getPropertyValue('--dan-cargo-site-color'),f.body.color);
  f.setEnabled('0');f.rescan();assert.equal(f.body.children.length,0);
  assert.equal(f.root.getAttribute('data-dan-pattern'),'none');
});
test('editor is inert and teardown removes owned paint and root state',()=>{
  const editor=fixture({editor:true});editor.flush();assert.equal(editor.body.children.length,0);
  const f=fixture();f.flush();f.instance.destroy();
  for(const node of [f.body,f.page,f.content])assert.equal(node.children.length,0);
  assert.equal(f.root.classList.contains('dan-global-background'),false);
  assert.equal(f.root.style.getPropertyValue('--dan-cargo-site-color'),'');
});
test('only opaque surfaces need a local pattern above their own paint',()=>{
  const f=fixture();
  for(const color of ['transparent','rgba(0, 0, 0, 0)','rgb(0 0 0 / .5)','color(srgb 0 0 0 / 50%)'])assert.equal(f.context.opaque(color),false);
  for(const color of ['rgb(1, 2, 3)','rgba(1, 2, 3, 1)','rgb(1 2 3 / 100%)'])assert.equal(f.context.opaque(color),true);
});
test('unpainted root uses actual Cargo body color, including updates and pattern-off mode',()=>{
  const f=fixture();f.flush();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),'body');
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),'dots');
  f.body.color='rgb(32, 48, 64)';f.rescan();
  assert.equal(f.root.style.getPropertyValue('--dan-cargo-site-color'),f.body.color);
  f.setEnabled('0');f.rescan();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),'body');
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),null);
});
test('opaque Cargo root colors and native image properties are never replaced',()=>{
  const f=fixture();f.root.color='rgb(20, 30, 40)';f.flush();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),null);
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),'dots');
  f.root.image='linear-gradient(red, blue)';f.rescan();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),null);
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),null);
  assert.equal(f.root.image,'linear-gradient(red, blue)');
  assert.equal(f.root.style.getPropertyValue('background-image'),'');
});
test('images do not veto an opaque blend base; unavailable opaque colors are not invented',()=>{
  const f=fixture();f.body.image='url("cargo-wallpaper.jpg")';f.flush();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),'body');
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),null);
  f.body.image='none';f.body.color='rgba(30, 40, 50, 0.5)';f.rescan();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),null);
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),null);
  f.body.color='rgb(30, 40, 50)';f.root.color='rgba(10, 20, 30, 0.2)';f.rescan();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),'body');
  assert.equal(f.instance.canvas.rootOpaque,true);
  f.root.color='color(srgb 0 0 0 / 0)';f.rescan();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),'body');
  f.instance.destroy();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),null);
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),null);
});
test('canvas dots are scroll-painted, normal dots stay fixed, and CSS never suppresses rubber-banding',()=>{
  const css=readFileSync(new URL('../css/backgrounds/dot-grid.css',import.meta.url),'utf8');
  const canvas=css.match(/html\.dan-global-background\[data-dan-canvas-pattern="dots"\]\s*\{([^}]+)\}/)[1];
  assert.match(canvas,/background-attachment:\s*scroll/);
  assert.match(canvas,/background-repeat:\s*repeat/);
  assert.match(css,/\.dan-site-pattern, \.dan-surface-pattern\s*\{[^}]*background-attachment:\s*fixed/s);
  assert.doesNotMatch(css,/overscroll-behavior[^:]*:\s*(?:none|contain)/);
  assert.doesNotMatch(css,/background-color:\s*#/);
  assert.doesNotMatch(source,/setInterval|addEventListener\('(?:scroll|wheel|touchmove)'/);
});
test('transparent body can use Cargo opaque site color even with native background images',()=>{
  const f=fixture();f.body.color='rgba(0, 0, 0, 0)';f.root.siteColor='rgb(230, 230, 230)';
  f.root.image='url("native-root.jpg")';f.flush();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),'site');
  assert.equal(f.instance.canvas.source,'site');assert.equal(f.instance.canvas.rootOpaque,true);
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),null);
  assert.equal(f.root.image,'url("native-root.jpg")');
  f.root.siteColor='rgb(100, 110, 120)';f.rescan();
  assert.equal(f.instance.canvas.rootColor,'rgb(100, 110, 120)');
});
test('actual opaque body color wins over stale site metadata; opaque native root needs no rule',()=>{
  const f=fixture();f.root.siteColor='rgb(1, 2, 3)';f.flush();
  assert.equal(f.instance.canvas.source,'body');assert.equal(f.instance.canvas.rootColor,f.body.color);
  f.root.color='rgb(50, 60, 70)';f.rescan();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),null);
  assert.equal(f.instance.canvas.source,'native-root');assert.equal(f.instance.canvas.rootColor,f.root.color);
});
test('no opaque Cargo source leaves root alone and diagnoses uncertainty, not a fabricated color',()=>{
  const f=fixture();f.body.color='transparent';f.root.siteColor='#ffffff80';f.flush();
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),null);
  assert.equal(f.instance.canvas.source,'unavailable');assert.equal(f.instance.canvas.rootOpaque,false);
  assert.equal(f.context.opaque('#fff8'),false);assert.equal(f.context.opaque('#ffff'),true);
});
test('fixed experiment reuses one body surface and suspends both canvas patches',()=>{
  const f=fixture({backplane:true});f.flush();
  const layer=f.body.children[0];
  assert.equal(layer.className,'dan-site-pattern');assert.equal(f.body.children.length,1);
  assert.equal(f.root.getAttribute('data-dan-background-mode'),'backplane');
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),null);
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),null);
  assert.equal(f.instance.canvas.backplaneColor,f.body.color);
  assert.equal(f.instance.canvas.backplaneOpaque,true);
  assert.equal(f.header.children.length,0);assert.equal(f.footer.children.length,0);
  f.navigate();f.rescan();assert.equal(f.body.children[0],layer);
  f.root.style.setProperty('--ENABLE_FIXED_BACKPLANE_EXPERIMENT','0');f.rescan();
  assert.equal(f.root.getAttribute('data-dan-background-mode'),'canvas');
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),'body');
  assert.equal(f.root.getAttribute('data-dan-canvas-pattern'),'dots');
  assert.equal(f.body.children[0],layer);
  f.instance.destroy();assert.equal(f.root.getAttribute('data-dan-background-mode'),null);
});
test('pattern toggle does not remove an enabled backplane or invent a transparent-site color',()=>{
  const f=fixture({backplane:true});f.setEnabled('0');f.flush();
  assert.equal(f.body.children.length,1);assert.equal(f.page.children.length,0);
  f.body.color='rgba(0, 0, 0, 0)';f.rescan();
  assert.equal(f.instance.canvas.backplaneOpaque,false);
  assert.equal(f.instance.canvas.backplaneColor,f.body.color);
  f.root.siteColor='rgb(220, 230, 240)';f.rescan();
  assert.equal(f.instance.canvas.backplaneColor,f.root.siteColor);
  f.root.siteColor='';f.root.color='rgb(40, 50, 60)';f.rescan();
  assert.equal(f.instance.canvas.backplaneColor,f.root.color);
});
test('experiment never covers native root/body wallpaper with a solid color',()=>{
  const f=fixture({backplane:true});f.body.image='url("cargo.jpg")';f.flush();
  assert.equal(f.instance.canvas.backplaneOpaque,false);
  assert.equal(f.instance.canvas.backplaneSource,'native-image-preserved');
  assert.equal(f.root.getAttribute('data-dan-canvas-color'),null);
  assert.equal(f.body.image,'url("cargo.jpg")');
});
test('experiment CSS adds only color below content, with no isolation, input or scroll control',()=>{
  const css=readFileSync(new URL('../css/backgrounds/dot-grid.css',import.meta.url),'utf8');
  assert.match(css,/--ENABLE_FIXED_BACKPLANE_EXPERIMENT:\s*1/);
  const backplane=css.match(/html\[data-dan-background-mode="backplane"\] body > \.dan-site-pattern\s*\{([^}]+)\}/)[1];
  assert.match(backplane,/background-color:\s*var\(--dan-cargo-site-color\)/);
  const layer=css.match(/body > \.dan-site-pattern\s*\{([^}]+)\}/)[1];
  assert.match(layer,/position:\s*fixed/);assert.match(layer,/z-index:\s*0/);
  assert.doesNotMatch(css,/(?:^|[;{])\s*(?:isolation|mix-blend-mode|transform|filter|overscroll-behavior)\s*:/m);
});

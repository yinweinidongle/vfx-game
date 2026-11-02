import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const COLORS = { sword: '#bc9bff', ice: '#72deff', cultivator: '#efd094' };

/** Three real model views share one WebGL context; disposed before entering the world. */
export class ClassModelPreview {
  constructor(root) {
    this.root = root;this.disposed = false;this.time = 0;this.last = 0;this.dirty = true;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');this.abort = new AbortController();
    this.renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;this.renderer.toneMapping = T.ACESFilmicToneMapping;this.renderer.toneMappingExposure = 1.0;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));this.renderer.setClearColor(0x000000, 0);this.renderer.autoClear = false;
    this.renderer.domElement.className = 'class-model-canvas';this.renderer.domElement.setAttribute('aria-hidden', 'true');root.append(this.renderer.domElement);
    const room = new RoomEnvironment(), pmrem = new T.PMREMGenerator(this.renderer);this.environment = pmrem.fromScene(room, .04);pmrem.dispose();room.dispose();
    this.views = [...root.querySelectorAll('[data-class]')].map((button, index) => this.makeView(button, index));
    this.resizeObserver = new ResizeObserver(() => { this.resize(); });this.resizeObserver.observe(root);this.resize();
    root.addEventListener('click', () => { this.dirty = true; }, { signal: this.abort.signal });
    this.renderer.domElement.addEventListener('webglcontextlost', e => {e.preventDefault();this.dispose();}, { signal: this.abort.signal });
    this.ready = this.load();this.tick = this.tick.bind(this);this.frame = requestAnimationFrame(this.tick);
  }
  makeView(button, index) {
    const kind = button.dataset.class, stage = button.querySelector('.class-model'), scene = new T.Scene();
    scene.environment = this.environment.texture;scene.environmentIntensity = .8;
    scene.add(new T.HemisphereLight('#dceeff', '#354554', 1.3));
    const key = new T.DirectionalLight('#fff2d4', 2.4);key.position.set(-3, 5, 6);scene.add(key);
    const fill = new T.DirectionalLight(COLORS[kind], 1.6);fill.position.set(3, 1, -2);scene.add(fill);
    const camera = new T.PerspectiveCamera(37, 1, .1, 20);camera.position.set(0, .18, 5);camera.lookAt(0, -.04, 0);
    const pivot = new T.Group(), turntable = new T.Group();pivot.add(turntable);scene.add(pivot);
    const energy = { uTime: { value: 0 }, uActive: { value: 0 }, uTint: { value: new T.Color(COLORS[kind]) } };
    const base = new T.ShaderMaterial({ uniforms: energy, transparent: true, depthWrite: false, side: T.DoubleSide,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform float uTime,uActive;uniform vec3 uTint;varying vec2 vUv;void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float ring=exp(-pow((r-.7)*100.,2.));float dash=step(.72,fract(a*9.5493-uTime*.08))*exp(-pow((r-.82)*85.,2.));float sweep=pow(max(0.,cos(a-uTime*.55)),18.)*ring;float mist=exp(-r*r*5.)*.055;float alpha=mist+(ring*.22+dash*.2+sweep*.4)*(.55+uActive*.45);if(alpha<.003)discard;gl_FragColor=vec4(uTint*(.7+sweep*1.8),alpha);}` });
    const disk = new T.Mesh(new T.PlaneGeometry(3.3, 3.3), base);disk.position.z = -.32;scene.add(disk);
    const vertices = new Float32Array(16 * 3), seeds = new Float32Array(16);
    for (let i = 0; i < 16; i++) { const a = i * 2.399;vertices.set([Math.cos(a), Math.sin(a), .1], i * 3);seeds[i] = i / 16; }
    const geo = new T.BufferGeometry();geo.setAttribute('position', new T.BufferAttribute(vertices, 3));geo.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
    const sparkle = new T.ShaderMaterial({ uniforms: energy, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `attribute float aSeed;uniform float uTime;varying float vAlpha;void main(){float t=uTime*.24+aSeed*6.283;vec3 p=position;p.x=cos(t)*(.88+aSeed*.3);p.y=sin(t)*1.24;p.z=sin(t*2.)*.32;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=2.+aSeed*2.;vAlpha=.15+.5*pow(max(0.,sin(uTime*1.3+aSeed*55.)),6.);}`,
      fragmentShader: `uniform vec3 uTint;uniform float uActive;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-d),2.)*vAlpha*(.5+uActive*.5);if(a<.003)discard;gl_FragColor=vec4(uTint*1.6,a);}` });
    scene.add(new T.Points(geo, sparkle));
    return { kind, button, stage, scene, camera, pivot, turntable, energy, index, model: null, active: 0 };
  }
  async load() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    return Promise.allSettled(this.views.map(async v => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}game/models/title/${v.kind}.glb`);
        if (this.disposed) { this.disposeRoot(gltf.scene);return; }
        const model = gltf.scene, box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
        const scale = 2.45 / Math.max(size.y, size.x * 1.35, size.z * 1.1);
        model.scale.setScalar(scale);model.position.copy(center).multiplyScalar(-scale);v.turntable.add(model);v.model = model;
        v.pivot.rotation.z = v.kind === 'sword' ? -.23 : v.kind === 'ice' ? .19 : 0;
        model.traverse(o => {
          if (!o.isMesh) return;
          for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
            material.envMapIntensity = 1.25;
            material.onBeforeCompile = shader => {
              shader.uniforms.uMenuTime = v.energy.uTime;shader.uniforms.uMenuActive = v.energy.uActive;shader.uniforms.uMenuTint = v.energy.uTint;
              shader.vertexShader = 'varying vec3 vMenuLocal;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMenuLocal=(modelMatrix*vec4(transformed,1.)).xyz;');
              shader.fragmentShader = 'varying vec3 vMenuLocal;uniform float uMenuTime,uMenuActive;uniform vec3 uMenuTint;\n' + shader.fragmentShader;
              shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `float rim=pow(1.-abs(dot(normalize(normal),normalize(vViewPosition))),3.);float pulse=exp(-pow((fract(vMenuLocal.y*.3-uMenuTime*.12)-.5)*20.,2.));outgoingLight+=uMenuTint*(rim*(.2+uMenuActive*.5)+pulse*.12*uMenuActive);\n#include <opaque_fragment>`);
            };
            material.customProgramCacheKey = () => 'class-model-preview-v1';material.needsUpdate = true;
          }
        });
        v.stage.classList.add('model-ready');v.stage.querySelector('.model-loading').textContent = '';this.dirty = true;
      } catch (error) { if(!this.disposed){v.stage.querySelector('.model-loading').textContent = '灵器暂未唤醒';console.warn('Class model preview:', v.kind, error.message);} }
    }));
  }
  resize() {
    if(this.disposed)return;const rect = this.root.getBoundingClientRect();
    this.width = Math.max(1, rect.width);this.height = Math.max(1, rect.height);this.renderer.setSize(this.width, this.height, false);this.dirty = true;
  }
  tick(now) {
    if(this.disposed)return;this.frame = requestAnimationFrame(this.tick);
    if (document.hidden || now - this.last < 32 || (this.reduced.matches && !this.dirty)) return;
    const dt = Math.min(.05, (now - this.last) / 1000);this.last = now;this.time += this.reduced.matches ? 0 : dt;
    this.renderer.setScissorTest(false);this.renderer.clear(true, true, true);
    const bounds = this.root.getBoundingClientRect();
    this.renderer.setScissorTest(true);
    for (const v of this.views) {
      const rect = v.stage.getBoundingClientRect(), x = rect.left - bounds.left, y = this.height - (rect.bottom - bounds.top);
      this.renderer.setViewport(x, y, rect.width, rect.height);this.renderer.setScissor(x, y, rect.width, rect.height);
      v.camera.aspect = rect.width / Math.max(1, rect.height);v.camera.updateProjectionMatrix();
      const selected = v.button.getAttribute('aria-pressed') === 'true';v.active = T.MathUtils.damp(v.active, selected ? 1 : .25, 6, dt);
      v.energy.uTime.value = this.time;v.energy.uActive.value = v.active;
      v.turntable.rotation.y = this.time * .38 + v.index * .45;v.pivot.position.y = Math.sin(this.time * 1.1 + v.index) * .055;
      this.renderer.render(v.scene, v.camera);
    }
    this.renderer.setScissorTest(false);this.dirty = false;
  }
  disposeRoot(root) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(o => { if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m); });
    for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
    for(const t of textures)t.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
  }
  dispose() {
    if(this.disposed)return;this.disposed = true;cancelAnimationFrame(this.frame);this.abort.abort();this.resizeObserver.disconnect();
    for(const v of this.views)this.disposeRoot(v.scene);this.environment.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
  }
}

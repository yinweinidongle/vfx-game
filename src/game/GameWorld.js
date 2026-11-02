import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRelicChest } from './RelicChest.js';
import { loadRuins } from './GameRuins.js';
import { MagicMandala } from '../vfx/cultivator/MagicMandala.js';
import { CONNECTIONS, ENCOUNTERS, INTERACTABLES, ZONES, heightAt, isLand, segmentDistance } from './GameData.js';

const noiseGLSL = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);} float fbm(vec2 p){return noise(p)*.55+noise(p*2.03)*.28+noise(p*4.1)*.17;}`;
const landGLSL = `float seg(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));} float land(vec2 p){float d=min(length(p-vec2(-28,6))-28.,min(length(p-vec2(18,-10))-24.,length(p-vec2(51,24))-22.));d=min(d,seg(p,vec2(-10,-1),vec2(4,-7))-5.2);return min(d,seg(p,vec2(31,2),vec2(42,14))-5.2);}`;
function random(seed) { let v = seed; return () => { v = (Math.imul(v, 1664525) + 1013904223) >>> 0; return v / 4294967296; }; }

export class GameWorld {
  constructor(scene, state) {
    this.scene = scene; this.state = state; this.group = new T.Group(); scene.add(this.group);
    this.night = { value: state.cycle?.night || 0 }; this.clock = { value: 0 }; this.hero = { value: new T.Vector3() }; this.mandalas = []; this.interact = new Map(); this.gates = [];
    this.materials = []; this.geometries = []; this.resources = []; this.colliders = []; this.ground(); this.architecture(); this.interactables(); this.atmosphere();
    state.obstacles = this.colliders;
  }
  stone(color = '#b7bfb6') {
    const m = new T.MeshStandardMaterial({ color, roughness: .88 });
    m.onBeforeCompile = s => {
      s.vertexShader = 'varying vec3 vStone;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStone=position;');
      s.fragmentShader = 'varying vec3 vStone;\n' + noiseGLSL + '\n' + s.fragmentShader;
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat grain=fbm(vStone.xz*2.1+vStone.y*.8);diffuseColor.rgb*=.78+grain*.32;');
    };
    this.materials.push(m); return m;
  }
  mesh(g, m, x, y, z, parent = this.group) {
    const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); this.geometries.push(g); return o;
  }
  ground() {
    const g = new T.PlaneGeometry(150, 110, 140, 100); g.rotateX(-Math.PI / 2);
    const positions = g.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setY(i, heightAt(positions.getX(i) + 10, positions.getZ(i)));
    g.computeVertexNormals();
    const m = new T.MeshStandardMaterial({ color: '#9bad9e', roughness: .98 });
    m.onBeforeCompile = s => {
      s.vertexShader = 'varying vec3 vGround;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround=(modelMatrix*vec4(position,1.)).xyz;');
      s.fragmentShader = 'varying vec3 vGround;\n' + noiseGLSL + landGLSL + '\n' + s.fragmentShader;
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p=vGround.xz;float edge=land(p);if(edge>0.)discard;float n=fbm(p*.55),fine=noise(p*8.);
        vec3 grass=mix(vec3(.045,.13,.09),vec3(.14,.24,.16),n);vec3 chalk=mix(vec3(.22,.25,.22),vec3(.34,.36,.29),n);
        float road=min(seg(p,vec2(-28,25),vec2(-24,-16)),min(seg(p,vec2(-24,-3),vec2(18,-10)),seg(p,vec2(18,-10),vec2(51,24))));
        float path=1.-smoothstep(1.8,3.6,road+(n-.5)*1.2);vec3 base=mix(grass,chalk,path);
        float court=1.-smoothstep(11.,13.,length(p-vec2(18,-10)));float throne=1.-smoothstep(15.,16.,length(p-vec2(51,24)));
        vec2 tile=abs(fract(p*.42)-.5);float grout=smoothstep(.46,.49,max(tile.x,tile.y));
        base=mix(base,mix(vec3(.24,.29,.31),vec3(.11,.15,.18),grout),court);base=mix(base,mix(vec3(.16,.21,.29),vec3(.065,.10,.16),grout),throne);
        diffuseColor.rgb=base*(.94+fine*.12);`);
    };
    this.materials.push(m); const ground = this.mesh(g, m, 10, 0, 0); ground.castShadow = false;
    const rock = this.stone('#5d7279');
    for (const a of ZONES) {
      const cliff = new T.CylinderGeometry(a.radius, a.radius * .73, 13, 48, 4, false);
      const p = cliff.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); const r = 1 + Math.sin(Math.atan2(z, x) * 9 + a.x) * .035; p.setXYZ(i, x * r, y - 6.4, z * r); }
      cliff.computeVertexNormals(); this.mesh(cliff, rock, a.x, -.7, a.z);
    }
    const waterM = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: this.clock, uNight: this.night }, vertexShader: 'varying vec3 vP;void main(){vP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.);}', fragmentShader: `${noiseGLSL}${landGLSL}varying vec3 vP;uniform float uTime,uNight;void main(){vec2 p=vP.xz;float n=fbm(p*.3+uTime*.06);float d=land(p);float rim=exp(-abs(d)*.7);float lines=pow(max(0.,sin(d*3.-uTime*1.4+n*3.)),12.)*exp(-abs(d)*.13);vec3 c=mix(vec3(.008,.035,.06),vec3(.025,.11,.14),n);c+=vec3(.38,.65,.65)*(rim*.25+lines*.1);c=mix(c,c*vec3(.4,.55,.85)+vec3(.003,.006,.015),uNight);gl_FragColor=vec4(c,.93);}` });
    const water = this.mesh(new T.PlaneGeometry(450, 350), waterM, 0, -9, 0); water.rotation.x = -Math.PI / 2; water.castShadow = false; this.materials.push(waterM);
  }
  architecture() {
    const stone = this.stone('#8a9c9c'), gold = new T.MeshStandardMaterial({ color: '#bda270', roughness: .4, metalness: .72 }); this.materials.push(gold);
    const details = [];
    const block = (x, y, z, w, h, d, material = stone) => {
      const g = new T.BoxGeometry(w, h, d); g.translate(x, y, z);
      if (material === stone) details.push(g); else this.mesh(g, material, 0, 0, 0);
    };
    for (const a of CONNECTIONS) {
      const length = Math.hypot(a[2] - a[0], a[3] - a[1]) + 12, x = (a[0] + a[2]) / 2, z = (a[1] + a[3]) / 2;
      const bridge = this.mesh(new T.BoxGeometry(8, .5, length), stone, x, -.16, z); bridge.rotation.y = Math.atan2(a[2] - a[0], a[3] - a[1]);
      for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
        const pos = new T.Vector3(side * 4.05, 0, (i / 6 - .5) * length).applyAxisAngle(new T.Vector3(0, 1, 0), bridge.rotation.y);
        block(x + pos.x, .6, z + pos.z, .5, 1.5, .5); this.mesh(new T.ConeGeometry(.43, .5, 4), gold, x + pos.x, 1.55, z + pos.z).rotation.y = Math.PI / 4;
      }
    }
    const centre = this.mesh(new T.OctahedronGeometry(1.2, 0), new T.MeshStandardMaterial({ color: '#6ddbdd', emissive: '#39bfca', emissiveIntensity: 1.1, metalness: .55, roughness: .2 }), 52, 9, 40); centre.scale.y = 2.2; this.crystal = centre;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const point = this.mesh(new T.OctahedronGeometry(.45), gold, 52 + Math.sin(a) * 7.7, 9 + Math.cos(a) * 7.7, 40); point.rotation.z = -a; point.scale.y = 2.2; }
    if (details.length) { const merged = mergeGeometries(details); details.forEach(g => g.dispose()); this.mesh(merged, stone, 0, 0, 0); }
    this.addGate(-2, -4.5, 0, .4); this.addGate(38, 10, 1, -.75);
  }
  addGate(x, z, seal, yaw) {
    const frame = new T.Group(); frame.position.set(x, heightAt(x, z), z); frame.rotation.y = yaw; this.group.add(frame);
    const m = new T.ShaderMaterial({ uniforms: { uTime: this.clock }, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: `${noiseGLSL}varying vec2 vUv;uniform float uTime;void main(){float edge=pow(abs(vUv.x-.5)*2.,8.);float n=fbm(vec2(vUv.x*12.,vUv.y*4.-uTime*.4));float a=(.08+n*.17+edge*.6)*sin(vUv.y*3.14159);gl_FragColor=vec4(vec3(.25,.6,1.1),a);}` });
    const veil = this.mesh(new T.PlaneGeometry(10, 5), m, 0, 2.5, 0, frame); veil.castShadow = false;
    this.gates.push({ group: frame, seal }); this.materials.push(m);
  }
  interactables() {
    const gold = new T.MeshStandardMaterial({ color: '#b99c66', metalness: .7, roughness: .42 });
    const jade = new T.MeshStandardMaterial({ color: '#1e4f57', metalness: .3, roughness: .48 });
    const marble = this.stone('#cbd2c8'); this.materials.push(gold, jade);
    const chestTemplate=makeRelicChest();this.resources.push(chestTemplate);
    for (const o of INTERACTABLES) {
      const root = new T.Group(); root.position.set(o.x, heightAt(o.x, o.z), o.z); this.group.add(root);
      const record = { data: o, root }; this.interact.set(o.id, record);
      this.colliders.push({x:o.x,z:o.z,r:o.type==='chest'?.7:o.type==='memory'?.5:.85});
      if (o.type === 'chest') {
        const chest=chestTemplate.clone(true);root.add(chest);record.lid=chest.getObjectByName('relic-chest-lid');
        record.contents=chest.getObjectByName('relic-chest-contents');record.glow=chest.getObjectByName('relic-chest-glow');record.glow.material=record.glow.material.clone();this.materials.push(record.glow.material);
        record.openAge=this.state.save.opened.includes(o.id)?10:-1;record.lid.rotation.x=record.openAge>0?-1.86:0;record.contents.visible=record.openAge<0;
      } else if (o.type === 'memory') {
        const slab = this.mesh(new T.BoxGeometry(.85, 1.5, .25), marble, 0, .7, 0, root); slab.rotation.z = -.1;
        const strip = this.mesh(new T.BoxGeometry(.07, .9, .03), gold, 0, .9, .14, root); strip.rotation.z = -.1;
      } else {
        const base = this.mesh(new T.CylinderGeometry(1, 1.3, .4, 8), marble, 0, .2, 0, root);
        this.mesh(new T.CylinderGeometry(.5, .7, 1.1, 8), jade, 0, .85, 0, root);
        const torus = this.mesh(new T.TorusGeometry(.76, .065, 8, 48), gold, 0, 2, 0, root); record.ring = torus;
        const gem = this.mesh(new T.OctahedronGeometry(.33), new T.MeshStandardMaterial({ color: '#a8f5f2', emissive: '#56d7e2', emissiveIntensity: 1.3, roughness: .16, metalness: .45 }), 0, 2, 0, root); gem.scale.y = 1.7; record.gem = gem; record.fallback = [base, ...root.children.filter(c => c !== gem)];
        const light = new T.PointLight('#75dce5', 2.4, 6, 2); light.position.y = 2; root.add(light); record.light = light;
        const seal = new MagicMandala(root, 2.1); seal.mesh.position.y = .05; this.mandalas.push({ seal, owner: o });
      }
    }
  }
  loadRuins() { return loadRuins(this); }
  async loadNature(onProgress) {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}game/models/nature-library.glb`);
    this.resources.push(gltf.scene); const rand = random(8842), placements = new Map();
    const add = (name, x, z, scale, yaw = rand() * Math.PI * 2) => { if (!placements.has(name)) placements.set(name, []); placements.get(name).push({ x, z, scale, yaw }); };
    const clear = (x, z, margin = 0) => {
      if (INTERACTABLES.some(o => Math.hypot(o.x - x, o.z - z) < 3 + margin)) return false;
      if (ENCOUNTERS.some(o => Math.hypot(o.x - x, o.z - z) < 5 + margin)) return false;
      const path = Math.min(segmentDistance(x, z, -28, 25, -24, -16), segmentDistance(x, z, -24, -3, 18, -10), segmentDistance(x, z, 18, -10, 51, 24));
      return path > 3.5 + margin;
    };
    for (let i = 0; i < 110; i++) {
      const x = -54 + rand() * 52, z = -21 + rand() * 52;
      if (isLand(x, z, 2) && clear(x, z, 1)) {
        const name = ['CommonTree_1', 'CommonTree_3', 'CommonTree_5', 'TwistedTree_2'][i % 4]; add(name, x, z, (name === 'TwistedTree_2' ? .34 : .78) * (.8 + rand() * .4)); this.colliders.push({ x, z, r: .7 });
      }
    }
    for (let i = 0; i < 36; i++) {
      const x = 2 + rand() * 68, z = -35 + rand() * 78;
      if (isLand(x, z, 2) && clear(x, z, 3)) { add(i % 3 === 0 ? 'DeadTree_2' : 'Pine_2', x, z, .65 + rand() * .6); this.colliders.push({ x, z, r: .6 }); }
    }
    for (let i = 0; i < 1150; i++) {
      const x = -55 + rand() * 128, z = -34 + rand() * 79;
      if (!isLand(x, z, 1) || !clear(x, z, -.5)) continue;
      if (x > 0 && Math.hypot(x - 18, z + 10) < 12 || x > 35 && Math.hypot(x - 51, z - 24) < 16) continue;
      const names = ['Grass_Common_Short', 'Fern_1', 'Bush_Common', 'Flower_3_Group', 'Flower_4_Group', 'Plant_1', 'Mushroom_Common'];
      add(names[i % names.length], x, z, .3 + rand() * .45);
    }
    for (const a of ZONES) for (let i = 0; i < 65; i++) {
      const angle = i / 65 * Math.PI * 2, radius = a.radius - 1.3 + rand() * 1.4;
      const x = a.x + Math.sin(angle) * radius, z = a.z + Math.cos(angle) * radius;
      if (CONNECTIONS.some(c => segmentDistance(x, z, ...c.slice(0, 4)) < 7)) continue;
      add(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'][i % 3], x, z, .5 + rand() * .65);
      this.colliders.push({ x, z, r: .9 });
    }
    // Uneven dressed stones articulate the traversable routes without blocking them.
    for(const route of [[-28,25,-24,-16],[-24,-3,18,-10],[18,-10,51,24]]){
      const [ax,az,bx,bz]=route,length=Math.hypot(bx-ax,bz-az),steps=Math.ceil(length/1.9);
      for(let i=0;i<=steps;i++){const t=i/steps,x=ax+(bx-ax)*t+(rand()-.5)*.28,z=az+(bz-az)*t+(rand()-.5)*.28;add('RockPath_Round_Wide',x,z,.75+rand()*.22);if(i%2===0)for(const side of [-1,1])add('Pebble_Round_1',x+side*1.5,z+(rand()-.5),1+rand());}
    }
    const dummy = new T.Object3D(), matrix = new T.Matrix4(), identity = new T.Matrix4();
    for (const [name, instances] of placements) {
      const asset = gltf.scene.getObjectByName(name); if (!asset) continue;
      asset.updateMatrixWorld(true); identity.copy(asset.matrixWorld).invert();
      asset.traverse(o => {
        if (!o.isMesh) return;
        const geometry = o.geometry.clone(); geometry.applyMatrix4(matrix.copy(identity).multiply(o.matrixWorld));
        const material = o.material.clone(); material.roughness = .85;
        const leaves = /leav|grass|flower|plant|fern/i.test(material.name); if (leaves) { material.side = T.DoubleSide; material.alphaTest = .42; }
        material.onBeforeCompile = s => {
          s.uniforms.uWindTime = this.clock; s.uniforms.uHero = this.hero;
          s.vertexShader = 'uniform float uWindTime;varying vec3 vNature;\n' + s.vertexShader;
          s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${leaves ? 'transformed.x+=sin(position.y*1.3+uWindTime*1.2+instanceMatrix[3].x)*.10*max(0.,position.y);transformed.z+=cos(position.x+uWindTime)*.06;' : ''}\nvNature=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;`);
          s.fragmentShader = 'uniform vec3 uHero;varying vec3 vNature;\n' + s.fragmentShader;
          s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${leaves ? 'float lum=dot(diffuseColor.rgb,vec3(.21,.72,.07));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.34,.55,.48)*lum*1.7,.52);' : ''}
            vec3 ray=uHero-cameraPosition;vec3 frag=vNature-cameraPosition;
            float along=dot(frag,ray)/max(.01,dot(ray,ray));float tube=length(frag-ray*along);
            if(along>0.&&along<1.&&vNature.y>1.5){float hide=smoothstep(.9,1.6,tube);if(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.54)>hide)discard;}`);
        };
        material.customProgramCacheKey = () => 'rpg-nature-focus-v2-' + leaves;
        const mesh = new T.InstancedMesh(geometry, material, instances.length); mesh.castShadow = true; mesh.receiveShadow = true;
        instances.forEach((p, i) => { dummy.position.set(p.x, heightAt(p.x, p.z) - .05, p.z); dummy.rotation.set(0, p.yaw, 0); dummy.scale.setScalar(p.scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
        mesh.computeBoundingSphere(); this.group.add(mesh); this.geometries.push(geometry); this.materials.push(material);
      });
    }
    onProgress?.('林地、遗迹与王座已构建');
  }
  async loadShrines() {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}game/models/celestial-shrine-v1.glb`); this.resources.push(gltf.scene);
    const bounds = new T.Box3().setFromObject(gltf.scene), size = bounds.getSize(new T.Vector3()), centre = bounds.getCenter(new T.Vector3());
    for (const r of this.interact.values()) if (r.data.type === 'seal' || r.data.type === 'camp') {
      for (const o of r.fallback) o.visible = false; r.gem.visible = false;
      const wrapper = new T.Group(), asset = gltf.scene.clone(true), scale = 3.1 / size.y;
      asset.scale.setScalar(scale); asset.position.set(-centre.x * scale, -bounds.min.y * scale, -centre.z * scale); wrapper.add(asset); r.root.add(wrapper);
      asset.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      r.shrine = wrapper;
    }
  }
  atmosphere() {
    const waterMaterial=new T.ShaderMaterial({uniforms:{uTime:this.clock},transparent:true,depthWrite:false,side:T.DoubleSide,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`${noiseGLSL}uniform float uTime;varying vec2 vUv;void main(){float n=fbm(vec2(vUv.x*12.,vUv.y*4.-uTime*1.8));float veins=pow(noise(vec2(vUv.x*38.,vUv.y*9.-uTime*4.)),4.);float edge=smoothstep(0.,.12,vUv.x)*(1.-smoothstep(.88,1.,vUv.x));float a=edge*(.28+n*.45);vec3 c=mix(vec3(.06,.25,.33),vec3(.65,1.05,1.1),n*.75+veins);gl_FragColor=vec4(c,a);}`});this.materials.push(waterMaterial);
    for(const [x,z,dx,dz]of [[-52.5,-5,-1,0],[25,-31.5,0,-1],[70,27,1,0]]){
      const position=[],uv=[],indices=[];
      for(let i=0;i<=24;i++){const t=i/24;for(let j=0;j<=8;j++){const s=j/8,width=2.2+(t*t)*1.6;position.push(x+dx*t*4-dz*(s-.5)*width,.12-9*t*t+Math.sin(s*15+t*8)*.05,z+dz*t*4+dx*(s-.5)*width);uv.push(s,t);if(i<24&&j<8){const a=i*9+j;indices.push(a,a+1,a+9,a+1,a+10,a+9);}}}
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();const fall=this.mesh(geometry,waterMaterial,0,0,0);fall.castShadow=false;fall.renderOrder=1;
    }
    const rand = random(719); const p = new Float32Array(260 * 3), seeds = new Float32Array(260);
    for (let i = 0; i < 260; i++) { p[i * 3] = rand() * 150 - 60; p[i * 3 + 1] = rand() * 8 + .5; p[i * 3 + 2] = rand() * 95 - 40; seeds[i] = rand(); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('aSeed', new T.BufferAttribute(seeds, 1));
    const m = new T.ShaderMaterial({ uniforms: { uTime: this.clock, uNight:this.night }, transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexShader: 'attribute float aSeed;uniform float uTime;varying float vAlpha;void main(){vec3 p=position;p.x+=sin(uTime*.3+aSeed*80.)*.6;p.y+=sin(uTime*.6+aSeed*20.)*.4;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(4.,32./-mv.z);vAlpha=.25+.2*sin(uTime+aSeed*60.);}', fragmentShader: 'uniform float uNight;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(mix(vec3(.7,1.,.93),vec3(1.7,1.2,.35),uNight),(1.-d)*vAlpha*(1.+uNight));}' });
    this.group.add(new T.Points(g, m)); this.geometries.push(g); this.materials.push(m);
  }
  update(time, dt) {
    this.clock.value = time; const p = this.state.player; this.hero.value.set(p.x, heightAt(p.x,p.z)+1.1, p.z);
    for (const { group, seal } of this.gates) group.visible = !this.state.save.seals[seal];
    for (const r of this.interact.values()) {
      if (r.gem) { r.gem.rotation.y = time * .45; r.gem.position.y = 2 + Math.sin(time * 1.2) * .1; }
      if (r.ring) r.ring.rotation.y = Math.sin(time * .3) * .15;
      if (r.lid) {
        if(r.openAge<0&&this.state.save.opened.includes(r.data.id))r.openAge=0;
        if(r.openAge>=0){r.openAge+=dt;const a=Math.min(1,r.openAge/.85),ease=1-Math.pow(1-a,3);r.lid.rotation.x=-1.86*ease;r.contents.visible=r.openAge<1.6;r.contents.position.y=Math.max(0,r.openAge-.25)*.22;r.contents.scale.setScalar(Math.max(0,Math.min(1,(1.6-r.openAge)/.55)));r.glow.material.uniforms.uAlpha.value=Math.max(0,Math.sin(Math.min(1,r.openAge/1.9)*Math.PI))*.7;}
      }
    }
    for (const { seal, owner } of this.mandalas) seal.update(time, 1, owner.type === 'camp' ? .34 : this.state.save.seals[owner.seal] ? .55 : .2, '#80d9e2');
    this.crystal.rotation.y = time * .2;
  }
  dispose() {
    this.group.removeFromParent(); for (const x of this.mandalas) x.seal.dispose();
    for (const g of new Set(this.geometries)) g.dispose(); for (const m of new Set(this.materials)) m.dispose();
    for (const root of this.resources) root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); } } });
  }
}

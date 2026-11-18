import * as T from 'three';
import { heightAt } from './GameData.js';
import { shoreRadius } from './RealmData.js';

const noise = `
  float hash(vec2 p) {
    vec3 q=fract(p.xyx*.1031);
    q+=dot(q,q.yzx+33.33);
    return fract((q.x+q.y)*q.z);
  }
  float ripple(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
      mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
  }
`;

function makeSheets(sheets, rows, columns, positionAt) {
  const positions=[], uv=[], seeds=[], indices=[];
  sheets.forEach((sheet,index)=>{
    const first=positions.length/3;
    for(let row=0;row<=rows;row++) {
      for(let column=0;column<=columns;column++) {
        const u=column/columns, v=row/rows;
        positions.push(...positionAt(sheet,u*2-1,v));
        uv.push(u,v);
        seeds.push(index*2.397);
        if(!row||!column) continue;
        const right=first+row*(columns+1)+column, above=right-columns-1;
        indices.push(right-1,above-1,above,right-1,above,right);
      }
    }
  });
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setAttribute('aSeed',new T.Float32BufferAttribute(seeds,1));
  geometry.setIndex(indices);
  return geometry;
}

function atmosphereMaterial(clock, night, vertexMotion, fragment) {
  return new T.ShaderMaterial({
    transparent:true, depthWrite:false, side:T.DoubleSide, forceSinglePass:true,
    uniforms:{uTime:clock,uNight:night},
    vertexShader:`
      attribute float aSeed;
      uniform float uTime;
      varying vec2 vFlow;
      varying float vSeed;
      void main() {
        vFlow=uv;
        vSeed=aSeed;
        vec3 pos=position;
        ${vertexMotion}
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
      }
    `,
    fragmentShader:noise+`
      uniform float uTime,uNight;
      varying vec2 vFlow;
      varying float vSeed;
      void main() {
        ${fragment}
      }
    `,
  });
}

function makeTideFalls(group, realm, clock, night) {
  const cuts=[[-2.82,.095],[-1.72,.124],[-.20,.064],[.38,.092],[2.42,.076]];
  const geometry=makeSheets(cuts,14,8,([angle,span],u,v)=>{
    const heading=angle+u*span*(1+.23*v);
    const shore=shoreRadius(realm,heading);
    const x=Math.cos(heading)*realm.rx*shore;
    const z=Math.sin(heading)*realm.rz*shore;
    const outset=.993+.046*Math.sqrt(v)+.022*v*v;
    const lip=heightAt(realm.x+x,realm.z+z)+.10;
    const drop=5.73+lip;
    return [x*outset,lip-drop*v,z*outset];
  });
  const material=atmosphereMaterial(clock,night,`
    float drift=sin(vFlow.y*10.-uTime*3.+vSeed)*.063*vFlow.y;
    pos.x+=drift;
    pos.z+=drift*.65;
  `,`
    vec2 uv=vFlow;
    float down=sqrt(max(uv.y,.002))-uTime*.82;
    float grain=ripple(vec2(uv.x*7.+vSeed,down*2.7));
    float lanes=ripple(vec2(uv.x*23.+vSeed+grain*.55,down*4.6));
    float edge=abs(uv.x*2.-1.)+(grain-.5)*uv.y*.23;
    float footprint=1.-smoothstep(.64,.99,edge);
    float pour=smoothstep(.0,.10,uv.y)*(1.-smoothstep(.89,1.,uv.y));
    float thread=smoothstep(.50,.92,lanes);
    float foam=smoothstep(.64,.96,uv.y)*smoothstep(.39,.8,grain);
    vec3 water=mix(vec3(.066,.31,.33),vec3(.62,1.18,1.06),
      thread*.67+foam*.33);
    float alpha=footprint*pour*(.25+thread*.42+foam*.18);
    gl_FragColor=vec4(water*(1.-uNight*.36),alpha);
  `);
  group.add(new T.Mesh(geometry,material));
}

function makeFurnacePlume(group, realm, clock, night) {
  const [x,z]=realm.landmark;
  const tongues=[
    {angle:.24,lift:2.62,reach:.94,width:1.13},
    {angle:1.83,lift:3.48,reach:.43,width:1.31},
    {angle:3.02,lift:2.03,reach:1.15,width:.98},
    {angle:4.65,lift:2.81,reach:.81,width:1.18},
  ];
  const geometry=makeSheets(tongues,16,12,({angle,lift,reach,width},u,v)=>{
    const a=angle+v*1.05;
    const bend=reach*(.34+.92*v*v);
    const offset=u*width*(.81+.31*Math.sin(Math.PI*v)-.64*v*v);
    return [x+Math.cos(a)*bend+Math.sin(a)*offset,3.89+lift*v,
      z+Math.sin(a)*bend-Math.cos(a)*offset];
  });
  const material=atmosphereMaterial(clock,night,`
    float curl=(.19+.18*sin(uTime*2.7+vSeed))*vFlow.y;
    pos.x+=sin(vFlow.y*4.2-uTime*3.1+vSeed)*curl;
    pos.z+=cos(vFlow.y*4.4-uTime*2.2+vSeed)*curl;
  `,`
    vec2 uv=vFlow;
    float rising=uv.y*2.4-uTime*1.5;
    float coarse=ripple(vec2(uv.x*2.6+vSeed,rising));
    float grain=ripple(vec2(uv.x*9.2+coarse*.43,rising*2.35+vSeed));
    float side=abs(uv.x*2.-1.+(coarse-.5)*uv.y*.67);
    float tip=1.-smoothstep(.58,1.,uv.y+(grain-.44)*uv.y*.38);
    float body=1.-smoothstep(.22,.98,side+uv.y*uv.y*.34);
    float folds=smoothstep(.28,.75,coarse*.73+grain*.27);
    float core=(1.-smoothstep(.12,.58,uv.y))*(1.-side)*folds;
    vec3 flame=mix(vec3(.86,.105,.027),vec3(2.6,1.25,.36),clamp(core+.19*folds,0.,1.));
    float alpha=tip*body*(.17+.49*folds)*smoothstep(.0,.09,uv.y);
    gl_FragColor=vec4(flame*(.92+.08*uNight),alpha);
  `);
  group.add(new T.Mesh(geometry,material));
}

function makeStarTransits(group, realm, clock, night) {
  const [x,z]=realm.landmark;
  const trajectories=[
    {radius:7.3,height:5.8,tilt:.28,width:.10,angle:0},
    {radius:10.2,height:5.6,tilt:-.22,width:.13,angle:1.78},
  ];
  const geometry=makeSheets(trajectories,108,2,({radius,height,tilt,width,angle},u,v)=>{
    const heading=angle+v*Math.PI*2;
    return [x+Math.cos(heading)*(radius+u*width),height+Math.sin(heading)*radius*tilt,
      z+Math.sin(heading)*(radius+u*width)*.76];
  });
  const material=atmosphereMaterial(clock,night,'',`
    float width=abs(vFlow.x*2.-1.);
    float phase=uTime*(.068+vSeed*.009)+vSeed*.37;
    float age=fract(phase-vFlow.y);
    float trail=(1.-smoothstep(.014,.115,age))*smoothstep(.0,.006,age);
    float distanceToHead=(age-.012)*118.;
    float knot=exp(-distanceToHead*distanceToHead);
    float line=1.-smoothstep(.13,.94,width);
    float alpha=line*(trail*.30+knot*.55);
    vec3 color=mix(vec3(.34,.40,.90),vec3(.91,.86,1.42),knot);
    gl_FragColor=vec4(color*(.88+uNight*.12),alpha);
  `);
  group.add(new T.Mesh(geometry,material));
}

export function makeRealmAtmosphere(group, realm, clock, night) {
  if(realm.id==='tide') makeTideFalls(group,realm,clock,night);
  else if(realm.id==='forge') makeFurnacePlume(group,realm,clock,night);
  else if(realm.id==='stars') makeStarTransits(group,realm,clock,night);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrescentGeometry } from '../src/vfx/sword/CrescentBlade.js';

test('the rear silhouette has three unequal raked forks while the forward surface and attachment tips remain stable',()=>{
  const segments=400,bands=10,columns=bands+1,geometry=createCrescentGeometry({segments,bands});
  const p=geometry.attributes.position,excess=[];
  for(let i=0;i<=segments;i++){
    const u=i/segments,angle=(u*2-1)*1.4,taper=Math.pow(Math.max(0,Math.sin(u*Math.PI)),.72),width=.65*taper+.004;
    const outerX=1.9*Math.cos(angle)-1.15,outerY=1.8/Math.sin(1.4)*Math.sin(angle);
    excess.push(outerX-width-p.getX(i*columns));
    // The trail reads the inner contour; lightning occupies V>=.18. Neither
    // the shared forward surface nor the outer arc moves as rear art changes.
    for(let j=2;j<=bands;j++){
      const v=j/bands,k=i*columns+j;
      assert.ok(Math.abs(p.getX(k)-(outerX-width*(1-v)))<1e-6);
      assert.ok(Math.abs(p.getY(k)-(outerY-Math.sin(angle)*width*(1-v)*.12))<1e-6);
    }
  }
  const peaks=[];
  for(let i=1;i<segments;i++)if(excess[i]>.05&&excess[i]>excess[i-1]&&excess[i]>excess[i+1])peaks.push({u:i/segments,length:excess[i]});
  assert.equal(peaks.length,3);
  assert.ok(peaks[0].length>peaks[1].length*1.7);assert.ok(peaks[1].length>peaks[2].length*1.5);
  assert.ok(peaks[0].u<.1&&peaks[1].u<.25&&peaks[2].u>.6,'the long lower sweep must be visibly asymmetric');
  assert.ok(Math.abs(p.getX(bands)-p.getX(segments*columns+bands))<1e-6);
  assert.ok(Math.abs(p.getY(bands)+1.8)<1e-6);assert.ok(Math.abs(p.getY(segments*columns+bands)-1.8)<1e-6);
  geometry.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SkillTimeline } from '../src/vfx/SkillTimeline.js';
test('default schedule reaches all six phases and fully dissipates at 2.6s', () => {
  const tl = new SkillTimeline();
  for (const [time, phase] of [[0,'gather'],[.4,'charge'],[.75,'launch'],[.9,'flight'],[1.5,'impact'],[1.85,'dissipate'],[2.6,'idle']]) { tl.seek(time); assert.equal(tl.phase,phase); }
  assert.equal(tl.duration,2.6);
});
test('changing projectile speed preserves flight position and impact age', () => {
  const tl = new SkillTimeline(); tl.seek(1.1);
  const progress = tl.progress; tl.setSpeed(30); assert.ok(Math.abs(tl.progress-progress)<1e-10);
  tl.seek(tl.impactTime+.2); tl.setSpeed(10); assert.ok(Math.abs(tl.time-tl.impactTime-.2)<1e-10);
});
test('pause, rewind and endpoints are bounded', () => {
  const tl = new SkillTimeline(); tl.advance(.1); tl.playing=false; tl.advance(1); assert.equal(tl.time,.1);
  tl.seek(100); assert.equal(tl.time,tl.duration); assert.equal(tl.progress,1);
  tl.seek(-2); assert.equal(tl.time,0); assert.equal(tl.progress,0);
  tl.playing=true; tl.advance(100); assert.equal(tl.phase,'idle'); tl.reset(); assert.equal(tl.phase,'gather');
});
test('retiming a resized arrow preserves normalized flight and post-impact age', () => {
  const tl = new SkillTimeline(13.5, 18); tl.seek(1.1); const p = tl.progress;
  tl.retime(12.293, 18); assert.ok(Math.abs(tl.progress-p)<1e-10);
  tl.seek(tl.impactTime+.3); tl.retime(14.2, 30); assert.ok(Math.abs(tl.time-tl.impactTime-.3)<1e-10);
});

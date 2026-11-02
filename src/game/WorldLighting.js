import * as T from 'three';
import { INTERACTABLES,heightAt } from './GameData.js';

/** Sun, moon, ambient fill and horizon share the simulation's continuous clock. */
export class WorldLighting {
  constructor(game) {
    this.game = game;
    this.colors = Object.fromEntries(Object.entries({ day: '#8ca9af', dusk: '#777486', night: '#101f36',
      sun: '#fff1d2', sunset: '#ffaf72', moon: '#a2c7ff', sky: '#e0f2f0', darkSky: '#789cc7',
      ground: '#344c50', darkGround: '#1d293d' }).map(([k, v]) => [k, new T.Color(v)]));
    this.moon = new T.DirectionalLight('#a2c7ff', 0);this.moon.position.set(20, 24, -30);game.scene.add(this.moon);
    this.lamps=INTERACTABLES.filter(o=>o.type==='camp').map(o=>{const light=new T.PointLight('#ffd89a',0,8,2);light.position.set(o.x,heightAt(o.x,o.z)+2.1,o.z);game.scene.add(light);return light;});
  }
  update(cycle, framing = 0) {
    const g = this.game, c = this.colors, n = cycle.night, gold = Math.max(cycle.dusk, cycle.dawn);
    g.scene.background.copy(c.day).lerp(c.night, n).lerp(c.dusk, gold * .48);
    g.scene.fog.color.copy(g.scene.background);g.scene.fog.density = .013 + n * .005;
    g.sun.color.copy(c.sun).lerp(c.sunset, gold * .78).lerp(c.moon, n);
    // The existing shadow-casting light becomes moonlight at night; one shadow map.
    g.sun.intensity = (2.4 * (1 - n) + .66 * n) * (1 - framing * .42);
    g.sky.color.copy(c.sky).lerp(c.darkSky, n);g.sky.groundColor.copy(c.ground).lerp(c.darkGround, n);
    g.sky.intensity = (1.15 - n * .56) * (1 - framing * .23);
    g.scene.environmentIntensity = (.38 - n * .17) * (1 - framing * .24);
    g.rim.intensity = .7 - n * .42;this.moon.intensity = n * .4;
    g.renderer.toneMappingExposure = .94 + n * .08;
    const p = g.state.player, orbit = cycle.phase * Math.PI * 2;
    g.sun.position.set(p.x - 18 + Math.sin(orbit) * 9, 28 + (1 - gold) * 9, p.z + 14 + Math.cos(orbit) * 9);
    g.sun.target.position.set(p.x, 0, p.z);g.sun.target.updateMatrixWorld();
    for(const lamp of this.lamps)lamp.intensity=n*14;
    if (g.world) g.world.night.value = n;
    if (g.actors) g.actors.night.value = n;
  }
  dispose() { this.moon.removeFromParent();for(const lamp of this.lamps)lamp.removeFromParent(); }
}

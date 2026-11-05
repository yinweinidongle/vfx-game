import test from 'node:test';
import assert from 'node:assert/strict';
import {GameState, readSave} from '../src/game/GameState.js';
import {GameNavigation} from '../src/game/GameNavigation.js';
import {ENCOUNTERS, INTERACTABLES, SKILLS} from '../src/game/GameData.js';
import {gearStats} from '../src/game/GearData.js';

const route = ['chest0','path','grove','frostkeeper','seal0','bridge','camp2','court',
  'library','starkeeper','seal1','stair','sovereign','camp2'];
const goals = new Map([...ENCOUNTERS, ...INTERACTABLES].map(goal => [goal.id, goal]));
const step = 1 / 60;

// Run the public simulation at a fixed step. Walking, target selection, damage,
// cooldowns, gear grants and the two sealed crossings all use normal gameplay.
function playCycle(initial, skills) {
  let state = initial, navigation = new GameNavigation(state);
  let goalIndex = 0, gearRevision = -1, waypoints = [], deaths = 0;
  for (let frame = 0; frame < 60 * 900 && goalIndex < route.length; frame++) {
    if (state.dead) {
      assert.ok(++deaths < 12, 'travel stalled at ' + route[goalIndex]);
      state.revive();
      waypoints = [];
    }
    const p = state.player, goal = goals.get(route[goalIndex]);
    while (state.pendingBoons) {
      const choice = ['power','vitality','power','spirit'][state.save.level % 4];
      const available = [choice, 'power','vitality','spirit'].find(id => state.save.boons[id] < 50);
      assert.ok(available);
      state.chooseBoon(available);
    }
    if (gearRevision !== state.gear.revision) {
      for (const item of state.save.gearBag) {
        const equipped = state.gear.find(state.save.gearEquipped[item.slot]);
        if (!equipped || Object.values(gearStats(item))[0] > Object.values(gearStats(equipped))[0]) state.gear.equip(item.uid);
      }
      gearRevision = state.gear.revision;
    }
    const target = state.aimTarget(p.x, p.z, 22);
    if (target && target.spawnGrace <= 0) {
      state.attack(target.x, target.z);
      if (frame % 15 === 0) {
        for (const i of [5,4,3,2,0,1]) {
          if (state.save.level < (SKILLS[i].unlockLevel || 1) || p.energy < SKILLS[i].cost) continue;
          if (state.cast(i, target.x, target.z)) { skills.add(SKILLS[i].key); break; }
        }
      }
    }
    if (p.hp < state.stats.hp * .58) state.heal();

    let reached = state.save.cleared.includes(goal.id) || state.save.opened.includes(goal.id);
    if (goal.type && state.nearby?.id === goal.id) {
      state.interact();
      if (goal.type === 'camp') reached = state.save.checkpoint === goal.id && state.gear.canTrade();
      if (goal.type === 'seal') reached = state.save.seals[goal.seal];
      if (goal.type === 'chest') reached = state.save.opened.includes(goal.id);
    }
    if (reached) {
      if (goal.id === 'seal0') {
        let data;
        state.write({setItem: (_, value) => { data = value; }});
        state = new GameState(state.kind, readSave({getItem: () => data}));
        navigation = new GameNavigation(state);
        gearRevision = -1;
      }
      goalIndex++;
      waypoints = [];
      continue;
    }
    if (!waypoints.length || frame % 90 === 0) waypoints = navigation.find(p.x, p.z, goal.x, goal.z) || [];
    while (waypoints.length && Math.hypot(waypoints[0].x - p.x, waypoints[0].z - p.z) < .28) waypoints.shift();
    const next = waypoints[0];
    const fighting = target && Math.hypot(target.x - p.x, target.z - p.z) < 15 &&
      (!goal.type || Math.hypot(p.x - goal.x, p.z - goal.z) < 10);
    state.update(step, {dx: next && !fighting ? next.x-p.x : 0, dz: next && !fighting ? next.z-p.z : 0});
    state.events.length = 0;
  }
  assert.equal(goalIndex, route.length, 'blocked at ' + route[goalIndex]);
  assert.equal(state.save.won, true);
  assert.equal(state.save.cleared.length, ENCOUNTERS.length);
  assert.deepEqual(state.save.seals, [true, true]);
  return state;
}

for (const kind of ['sword','ice','cultivator']) {
  test(kind + ' can clear the campaign, bank ground loot and unlock and cast every awakening through progression', t => {
    let state = new GameState(kind);
    const used = new Set(), levels = [];
    for (let cycle = 0; cycle < 6; cycle++) {
      state = playCycle(state, used);
      levels.push(state.save.level);
      const liveLoot = state.drops.filter(d => d.alive && d.gear).length;
      const before = state.save.gearBag.length;
      const next = state.nextCycle();
      assert.ok(next);
      assert.equal(next.save.challenge, cycle + 1);
      assert.equal(next.save.gearBag.length, Math.min(150, before + liveLoot));
      assert.equal(next.drops.length, 0);
      assert.equal(next.save.cleared.length, 0);
      assert.equal(next.save.boons.power, state.save.boons.power);
      if (used.size === 6) break;
      state = next;
    }
    assert.deepEqual([...used].sort(), ['E','G','H','J','Q','R']);
    t.diagnostic('各轮通关等级 ' + levels.join(' / '));
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { distance, INTERACTABLES, SAVE_KEY } from '../src/game/GameData.js';
import { GameNavigation } from '../src/game/GameNavigation.js';
import { GameState, readSave } from '../src/game/GameState.js';
import { REALMS, REALM_BY_ID, realmReward } from '../src/game/RealmData.js';
import { insideRealmStrike } from '../src/game/RealmJourney.js';

const step = 1 / 60;
const noMovement = { dx: 0, dz: 0 };

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function createJourney(kind, realm) {
  const state = new GameState(kind);
  state.save.level = realm.level;
  state.recalculate();
  state.player.hp = state.stats.hp;
  state.obstacles.push(...realm.obstacles);
  assert.ok(state.realms.enter(realm.id));
  return state;
}

function movement(player, route, goal, stoppingDistance) {
  while (route.length && distance(player, route[0]) < .6) route.shift();
  if (!route.length || distance(player, goal) <= stoppingDistance) return noMovement;
  return { dx: route[0].x - player.x, dz: route[0].z - player.z };
}

function walkTo(state, destination) {
  const { player } = state;
  const route = new GameNavigation(state).find(player.x, player.z, destination.x, destination.z);
  assert.ok(route?.length, 'the destination must be reachable on foot');
  for (let frame = 0; frame < 1200 && distance(player, destination) > .65; frame++) {
    state.update(step, movement(player, route, destination, .65));
  }
  assert.ok(distance(player, destination) <= .65, 'the player follows the route around scenery');
}

function fightJourney(state, realm) {
  const { player, realms } = state;
  const navigation = new GameNavigation(state);
  const seenTypes = new Set();
  let route = [], lastGoal = '', attacks = 0, casts = 0, interactions = 0, clears = 0, stones = 0;
  state.events.length = 0;
  for (let frame = 0; frame < 9000 && !realms.progress.finished && !state.dead; frame++) {
    if (state.pendingBoons) state.chooseBoon('power');
    const goal = state.objective();
    const goalName = goal.title + (goal.name || '');
    if (frame % 50 === 0 || lastGoal !== goalName) {
      route = navigation.find(player.x, player.z, goal.x, goal.z) || [];
      lastGoal = goalName;
    }
    const within = realms.allMarked || realm.id === 'forge' ? 5 : 1.6;
    const foes = state.enemies.filter(enemy => enemy.hp > 0);
    const closest = enemies => enemies.sort((a, b) => distance(a, player) - distance(b, player))[0];
    const target = realms.keeper || closest(foes.filter(enemy => enemy.family === 'core')) || closest(foes);
    if (target && distance(target, player) < 15) {
      if (frame % 10 === 0 && state.cast(realms.keeper ? 2 : 0, target.x, target.z)) casts++;
      if (frame % 4 === 0 && state.attack(target.x, target.z)) attacks++;
    }
    if (player.hp < state.stats.hp * .55) state.heal();
    state.update(step, movement(player, route, goal, within));
    if (state.nearby?.type === 'realmStar') {
      state.interact();
      interactions++;
    }
    for (const event of state.events.splice(0)) {
      if (event.type === 'spawn') seenTypes.add(event.enemy.type);
      if (event.type === 'realmClear') clears++;
      if (event.type === 'stonePickup') stones += event.amount;
    }
  }
  assert.ok(attacks > 0 && casts > 0, 'combat uses ordinary input actions');
  assert.equal(interactions, realm.id === 'stars' ? realm.nodes.length : 0);
  assert.ok(seenTypes.has(realm.minion));
  assert.ok(seenTypes.has(realm.keeper));
  if (realm.id === 'forge') assert.ok(seenTypes.has('furnaceHeart'));
  assert.equal(state.dead, false, `died in ${realm.id} as ${state.kind}`);
  assert.equal(realms.progress.finished, true, `did not clear ${realm.id} as ${state.kind}`);
  assert.equal(clears, 1);
  return { stones };
}

for (const realm of REALMS) {
  test(`all three classes clear ${realm.id} from the recommended level using real movement and combat`, () => {
    for (const kind of ['sword', 'ice', 'cultivator']) {
      const state = createJourney(kind, realm);
      fightJourney(state, realm);
      assert.match(state.realms.keeper.name, /\S+/);
      assert.equal(state.realms.progress.wins[realm.id], 1);
      assert.deepEqual(state.save.cleared, [], 'expedition kills do not clear story encounters');
    }
  });
}

test('waiting or reloading at a realm dock cannot start combat', () => {
  const realm = REALM_BY_ID.stars, saveSlot = storage();
  const state = createJourney('sword', realm);
  assert.ok(state.write(saveSlot));
  const restored = new GameState('sword', readSave(saveSlot));
  for (let frame = 0; frame < 900; frame++) restored.update(step, noMovement);
  assert.equal(restored.player.hp, restored.stats.hp);
  assert.equal(restored.enemies.length, 0);
  assert.equal(restored.nearby?.type, 'realmExit');
  walkTo(restored, realm.nodes[0]);
  assert.ok(restored.enemies.some(enemy => enemy.type === realm.minion));
});

test('a pre-realm save retains existing story progress and can take the new portal', () => {
  const state = new GameState('cultivator'), saveSlot = storage();
  const { realms, ...legacySave } = state.save;
  legacySave.level = 8;
  legacySave.seals = [true, false];
  legacySave.cleared = ['frostkeeper'];
  saveSlot.setItem(SAVE_KEY, JSON.stringify(legacySave));
  const restored = new GameState('cultivator', readSave(saveSlot));
  assert.equal(restored.save.level, 8);
  assert.deepEqual(restored.save.seals, [true, false]);
  assert.deepEqual(restored.save.cleared, ['frostkeeper']);
  assert.equal(restored.realms.realm, null);
  assert.ok(restored.realms.enter('stars'));
  assert.equal(restored.realms.mask, 0);
});

test('ordered stars persist across reload and return to the departure lamp', () => {
  const realm = REALM_BY_ID.stars, saveSlot = storage();
  const state = new GameState('ice');
  const camp = INTERACTABLES.find(point => point.type === 'camp' && point.id !== state.save.checkpoint);
  state.save.seals[0] = true;
  state.obstacles.push(...realm.obstacles);
  Object.assign(state.player, { x: camp.x, z: camp.z - 1 });
  assert.ok(state.realms.enter(realm.id));
  assert.equal(state.save.checkpoint, camp.id);

  walkTo(state, realm.nodes[1]);
  state.interact();
  assert.equal(state.realms.mask, 0, 'interacting with a later star cannot skip the sequence');
  walkTo(state, realm.nodes[0]);
  state.interact();
  assert.equal(state.realms.mask, 1);
  assert.equal(state.realms.keeper, null);
  assert.ok(state.write(saveSlot));

  const restored = new GameState('ice', readSave(saveSlot));
  assert.equal(restored.realms.realm, realm);
  assert.equal(restored.realms.mask, 1);
  assert.equal(restored.objective().name, realm.nodes[1].name);
  assert.equal(restored.realms.strikes.some(strike => strike.active), false);
  restored.update(step, noMovement);
  assert.equal(restored.nearby?.type, 'realmExit');
  restored.interact();
  assert.equal(restored.realms.realm, null);
  assert.equal(restored.save.realms.active, null);
  assert.ok(distance(restored.player, camp) < 3);
  assert.ok(restored.realms.enter(realm.id));
  assert.equal(restored.realms.mask, 1, 'leaving the realm does not discard puzzle progress');
});

test('first-clear rewards remain claimed on reload and a full replay earns the reduced reward', () => {
  const realm = REALM_BY_ID.tide, saveSlot = storage();
  const state = createJourney('sword', realm);
  const first = fightJourney(state, realm);
  const clearGold = state.save.gold;
  assert.equal(clearGold - first.stones, realmReward(realm, true, 0).gold);
  assert.ok(state.write(saveSlot));
  const restored = new GameState('sword', readSave(saveSlot));
  restored.obstacles.push(...realm.obstacles);
  for (let frame = 0; frame < 120; frame++) restored.update(step, noMovement);
  assert.equal(restored.realms.progress.finished, true);
  assert.equal(restored.realms.keeper, null);
  assert.equal(restored.save.gold, clearGold);
  assert.equal(restored.events.some(event => event.type === 'realmClear'), false);
  while (restored.pendingBoons) restored.chooseBoon('power');
  assert.ok(restored.realms.leave());
  const replayGold = restored.save.gold;
  assert.ok(restored.realms.enter(realm.id));
  const replay = fightJourney(restored, realm);
  assert.equal(restored.realms.progress.wins[realm.id], 2);
  assert.equal(restored.save.gold - replayGold - replay.stones, realmReward(realm, false, 0).gold);
});

test('the tide mark requires continuous occupancy and its shockwave respects the safe center', () => {
  const realm = REALM_BY_ID.tide, state = createJourney('sword', realm);
  const { player, realms } = state;
  walkTo(state, realm.nodes[0]);
  for (let frame = 0; frame < 30; frame++) state.update(step, noMovement);
  assert.ok(realms.charge > 0);
  assert.equal(realms.mask, 0);
  walkTo(state, realm.arrival);
  assert.equal(realms.charge, 0);
  assert.equal(realms.mask, 0);

  const source = { family: 'ray', hp: 100, sequence: 1, targetX: player.x, targetZ: player.z };
  const health = player.hp;
  player.invulnerable = 0;
  realms.attack(source, 20);
  const ring = realms.strikes.find(strike => strike.active);
  assert.equal(insideRealmStrike(ring, player), false);
  for (let frame = 0; frame < 90; frame++) realms.update(step);
  assert.equal(player.hp, health);

  realms.attack(source, 20);
  const newRing = realms.strikes.find(strike => strike.active);
  player.x += (newRing.inner + newRing.radius) / 2;
  assert.equal(insideRealmStrike(newRing, player), true);
  for (let frame = 0; frame < 90; frame++) realms.update(step);
  assert.equal(player.hp, health - 20);

  player.invulnerable = 0;
  realms.attack(source, 20);
  source.hp = 0;
  for (let frame = 0; frame < 90; frame++) realms.update(step);
  assert.equal(player.hp, health - 20, 'the windup disappears with the defeated caster');
  assert.equal(realms.strikes.some(strike => strike.active), false);
});

test('the forge charge and astral cross keep their telegraph aligned to the locked target', () => {
  const forge = REALM_BY_ID.forge, forgeState = createJourney('sword', forge);
  const forgeTarget = forge.arrival;
  const scorpion = forgeState.realms.spawn(forge.keeper, { x: forgeTarget.x, z: forgeTarget.z - 7 }, -1);
  Object.assign(scorpion, { targetX: forgeTarget.x, targetZ: forgeTarget.z, sequence: 1 });
  forgeState.realms.attack(scorpion, 20);
  const forgeStrikes = forgeState.realms.strikes.filter(strike => strike.active);
  const rush = forgeStrikes.find(strike => strike.lunge);
  assert.ok(forgeStrikes.length >= 3);
  assert.equal(forgeStrikes.filter(strike => strike.lunge).length, 1);
  assert.equal(insideRealmStrike(rush, forgeTarget), true);
  assert.equal(insideRealmStrike(rush, { x: forgeTarget.x + 1.4, z: forgeTarget.z }), false);

  const stars = REALM_BY_ID.stars, starsState = createJourney('sword', stars);
  const starsTarget = stars.arrival;
  const orrery = starsState.realms.spawn(stars.keeper, { x: starsTarget.x, z: starsTarget.z - 8 }, -1);
  Object.assign(orrery, { targetX: starsTarget.x, targetZ: starsTarget.z, sequence: 1 });
  starsState.realms.attack(orrery, 20);
  const starStrikes = starsState.realms.strikes.filter(strike => strike.active && strike.kind === 'line');
  const firstImpact = Math.min(...starStrikes.map(strike => strike.delay));
  const cross = starStrikes.filter(strike => strike.delay === firstImpact);
  assert.equal(cross.length, 2);
  for (const beam of cross) assert.equal(insideRealmStrike(beam, starsTarget), true);
  const angle = cross[0].yaw + Math.PI / 4;
  const corner = { x: starsTarget.x + 3 * Math.sin(angle), z: starsTarget.z + 3 * Math.cos(angle) };
  for (const beam of cross) assert.equal(insideRealmStrike(beam, corner), false);
});

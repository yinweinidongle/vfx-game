import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Group, PerspectiveCamera} from 'three';
import {GameState, readSave} from '../src/game/GameState.js';
import {ENCOUNTERS} from '../src/game/GameData.js';
import {LootFlare} from '../src/game/LootFlare.js';
import {LootSound, LOOT_SOUNDS} from '../src/game/LootSound.js';

const player = {x: 0, z: 0};
const camera = new PerspectiveCamera();
const drop = (rarity, x = 0, lootId = 1) => ({type: 'gearDrop', rarity, lootId, x, y: 1, z: 0});

test('a real kill emits one birth and one landing, including a save made before contact', () => {
  for (const [tier, roll] of [.8, .11, .01].entries()) {
    const state = new GameState('sword');
    state.spawn(ENCOUNTERS[0]);
    const enemy = state.enemies[0];
    Object.assign(enemy, {x: state.player.x, z: state.player.z, hp: 1});
    const rolls = [.99, .05, roll, .92];
    state.random = () => rolls.shift() ?? .7;
    state.hit(enemy, 10, 'physical');
    const births = state.events.filter(e => e.type === 'gearDrop');
    assert.equal(births.length, 1);
    const [birth] = births;
    assert.equal(birth.rarity, tier);
    assert.equal(birth.x, enemy.x);
    let saved;
    state.write({setItem: (_, value) => { saved = value; }});
    const restored = new GameState('sword', readSave({getItem: () => saved}));
    restored.started = new Set(ENCOUNTERS.map(e => e.id));
    const item = restored.drops.find(d => d.gear);
    for (let i = 0; i < 180; i++) restored.update(1 / 60, {dx: 0, dz: 0});
    assert.equal(restored.events.filter(e => e.type === 'gearDrop').length, 0);
    const contacts = restored.events.filter(e => e.type === 'gearLand');
    assert.equal(contacts.length, 1);
    assert.deepEqual([contacts[0].lootId, contacts[0].rarity, contacts[0].x, contacts[0].z],
      [birth.lootId, tier, item.landX, item.landZ]);
    assert.equal(restored.save.gearBag.length, 1);
  }
});

test('same-site bursts keep the highest rarity, freeze their launch orientation and reuse bounded GPU buffers', () => {
  const eye = new PerspectiveCamera();
  eye.position.set(4, 3, 12);
  const effect = new LootFlare(new Group(), eye);
  const matrices = effect.layers.map(mesh => mesh.instanceMatrix);
  const cues = effect.layers.map(mesh => mesh.geometry.attributes.aCue);
  effect.emit(drop(0));
  effect.emit(drop(2, .12));
  effect.emit(drop(1, .2));
  effect.update(.015);
  assert.equal(effect.pool.filter(p => p.alive).length, 1);
  assert.equal(effect.pool[0].tier, 2);
  const firstMatrix = matrices[1].array.slice(0, 16);
  eye.position.set(-12, 8, -9);
  effect.update(.015);
  assert.deepEqual(matrices[1].array.slice(0, 16), firstMatrix);
  effect.emit({...drop(2), type: 'gearLand'});
  effect.update(0);
  assert.ok(effect.pool[1].reach < effect.pool[0].reach);
  assert.equal(cues[1].getZ(1), 1);
  for (let i = 1; i < 60; i++) effect.emit(drop(2, i * 2, i));
  effect.emit(drop(0, -50));
  effect.update(.01);
  assert.ok(effect.pool.every(p => p.alive && p.tier === 2));
  for (const mesh of effect.layers) assert.equal(mesh.count, 32);
  effect.update(1);
  for (const [i, mesh] of effect.layers.entries()) {
    assert.equal(mesh.visible, false);
    assert.equal(mesh.count, 0);
    assert.equal(mesh.instanceMatrix, matrices[i]);
    assert.equal(mesh.geometry.attributes.aCue, cues[i]);
    mesh.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test('the shipped audio bank has six distinct audible non-clipping cues with silent boundaries', async () => {
  const wav = await readFile('public/game/audio/loot/treasure-chimes-v1.wav');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  const rate = wav.readUInt32LE(24);
  assert.equal(rate, 32000);
  assert.equal(wav.readUInt16LE(34), 16);
  const pcm = wav.subarray(44), hashes = new Set();
  let lastEnd = 0;
  for (const cue of Object.values(LOOT_SOUNDS).flat()) {
    const start = Math.round(cue.offset * rate) * 2;
    const end = start + Math.floor(cue.length * rate) * 2;
    assert.ok(end <= pcm.length && start >= lastEnd);
    assert.ok(pcm.subarray(lastEnd, start).every(byte => byte === 0));
    const slice = pcm.subarray(start, end);
    let energy = 0, peak = 0;
    for (let i = 0; i < slice.length; i += 2) {
      const sample = slice.readInt16LE(i) / 32768;
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    assert.ok(peak > .8 && peak < .9);
    assert.ok(Math.sqrt(2 * energy / slice.length) > .035);
    assert.equal(slice.readInt16LE(0), 0);
    assert.ok(Math.abs(slice.readInt16LE(slice.length - 2)) < 12);
    hashes.add(createHash('sha256').update(slice).digest('hex'));
    lastEnd = end;
  }
  assert.equal(hashes.size, 6);
});

function audioHarness() {
  const starts = [], sources = [], panners = [];
  const node = () => ({connect: target => target, disconnect() {}});
  const context = {
    currentTime: 1, state: 'running',
    createBufferSource() {
      const source = {...node(), start: (...args) => starts.push(args), stop() {}};
      sources.push(source);
      return source;
    },
    createGain: () => ({...node(), gain: {value: 0, setTargetAtTime() {}}}),
    createStereoPanner() {
      const panner = {...node(), pan: {value: 0}};
      panners.push(panner);
      return panner;
    },
  };
  const bank = new LootSound({context, master: node()});
  bank.buffer = {};
  return {context, bank, starts, sources, panners};
}

test('a simultaneous loot volley chooses the closest epic chime, then a separate landing reply', () => {
  const {context, bank, starts, sources, panners} = audioHarness();
  bank.handle([drop(0), drop(2, -12), drop(1, 2), drop(2, 3)], player, camera);
  const cue = LOOT_SOUNDS.gearDrop[2];
  assert.deepEqual(starts, [[1, cue.offset, cue.length]]);
  assert.ok(panners[0].pan.value > 0);
  context.currentTime += .04;
  bank.handle([drop(1), drop(0)], player, camera);
  assert.equal(starts.length, 1);
  context.currentTime = 1.8;
  bank.handle([{...drop(2), type: 'gearLand'}, {type: 'gearLoot'}], player, camera);
  const landing = LOOT_SOUNDS.gearLand[2];
  assert.deepEqual(starts[1], [1.8, landing.offset, landing.length]);
  for (const source of sources) source.onended();
  assert.equal(bank.voices.size, 0);
});

test('distant and suspended events stay quiet, and a loot storm caps concurrent chimes', () => {
  const {context, bank, starts} = audioHarness();
  bank.handle([drop(2, 41)], player, camera);
  context.state = 'suspended';
  bank.handle([drop(2)], player, camera);
  assert.equal(starts.length, 0);
  context.state = 'running';
  for (let i = 0; i < 12; i++) {
    context.currentTime += .11;
    bank.handle([drop(2, i)], player, camera);
  }
  assert.equal(bank.voices.size, 6);
  const count = starts.length;
  bank.handle([{...drop(1), type: 'gearLand'}], player, camera);
  assert.equal(starts.length, count);
  bank.dispose();
  assert.equal(bank.voices.size, 0);
});

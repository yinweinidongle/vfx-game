export const defaults = Object.freeze({
  character: 'cultivator', meteorCount: 60, meteorSize: 1, avatarScale: 1, avatarFresnel: 1.25, avatarColor: '#8ac4ff', divineColor: '#ffc86a', bladeSize: 1, energyColor: '#39dfff', lightningColor: '#9170ff',
  hitStop: true, cameraShake: true, screenFlash: true,
  flowTextureUrl: `${import.meta.env?.BASE_URL || '/'}textures/storm-energy-flow.png`,
  autoLoop: true, playbackSpeed: 0.7, flightSpeed: 18, arrowSize: 0.52,
  homingCount: 6, particleDensity: 1, shardCount: 42, trailLength: 7.5, bloomStrength: 0.65,
  frostColor: '#58dfff', impactRadius: 1.6, cameraMode: 'cinematic',
});
export const config = { ...defaults };
export const ORIGIN = [-7.633, 1.7, 0];
export const TARGET = [7.5, 1.7, 0];

import * as THREE from 'three';
import type { Rng } from '../core/seed';

export interface Palette {
  name: string;
  bg: THREE.Color;
  /** Four accent colors, roughly dark → bright. */
  colors: [THREE.Color, THREE.Color, THREE.Color, THREE.Color];
  /** Highlight used for the formed number. */
  hot: THREE.Color;
  css: { bg: string; a: string; b: string; hot: string };
}

const RAW: Array<[string, string, string[], string]> = [
  ['Aurora', '#02030a', ['#00ffa3', '#00c2ff', '#7b61ff', '#ff4fd8'], '#e8fffb'],
  ['Magma', '#070000', ['#ff2a00', '#ff7a00', '#ffc400', '#fff1a8'], '#ffffff'],
  ['Sakura', '#0b0410', ['#ff5fa2', '#ff9ec7', '#ffd1e3', '#b388ff'], '#fff4fa'],
  ['Cyberpunk', '#05010d', ['#ff006e', '#8338ec', '#3a86ff', '#00f5d4'], '#fefae0'],
  ['Royal Gold', '#040308', ['#6a4c93', '#c9a227', '#ffd166', '#fff3b0'], '#fffdf0'],
  ['Deep Ocean', '#00040a', ['#003f88', '#00a6fb', '#48cae4', '#caf0f8'], '#ffffff'],
  ['Toxic', '#010602', ['#38b000', '#70e000', '#ccff33', '#f5ff9e'], '#ffffff'],
  ['Sunset', '#0a0206', ['#7400b8', '#e0457b', '#ff8c42', '#ffd23f'], '#fff9e6'],
  ['Ice', '#02060b', ['#4cc9f0', '#90e0ef', '#bde0fe', '#e0fbfc'], '#ffffff'],
  ['Neon Tokyo', '#030008', ['#f72585', '#b5179e', '#4cc9f0', '#f9f871'], '#ffffff'],
  ['Emerald Crown', '#010503', ['#00916e', '#00e0a1', '#ffcf56', '#fffbdb'], '#ffffff'],
  ['Plasma', '#040010', ['#3d00b8', '#ff2e97', '#ff9e00', '#00fff0'], '#ffffff'],
];

export const PALETTES: Palette[] = RAW.map(([name, bg, cs, hot]) => ({
  name,
  bg: new THREE.Color(bg),
  colors: cs.map((c) => new THREE.Color(c)) as Palette['colors'],
  hot: new THREE.Color(hot),
  css: { bg, a: cs[1], b: cs[3], hot },
}));

export function pickPalette(rng: Rng): Palette {
  return rng.pick(PALETTES);
}

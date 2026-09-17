import type { EffectFactory } from './types';
import { supernova } from './list/supernova';
import { compile } from './list/compile';
import { fireworks } from './list/fireworks';
import { hacker } from './list/hacker';
import { liquidMetal } from './list/liquidMetal';
import { sakuraHole } from './list/sakuraHole';
import { planets } from './list/planets';
import { voxelCity } from './list/voxelCity';
import { cranes } from './list/cranes';
import { calligraphy } from './list/calligraphy';
import { reviewFire } from './list/reviewFire';
import { kaleidoscope } from './list/kaleidoscope';
import { clockwork } from './list/clockwork';
import { corridor } from './list/corridor';
import { confetti } from './list/confetti';
import { quantum } from './list/quantum';
import { finale } from './list/finale';

/** Daily rotation. Order matters for the shuffle bag — append new effects at the end. */
export const EFFECTS: EffectFactory[] = [
  supernova,
  compile,
  fireworks,
  hacker,
  liquidMetal,
  sakuraHole,
  planets,
  voxelCity,
  cranes,
  calligraphy,
  reviewFire,
  kaleidoscope,
  clockwork,
  corridor,
  confetti,
  quantum,
];

/** Effects only used on special days (not part of the rotation). */
export const SPECIAL_EFFECTS: EffectFactory[] = [finale];

export const ALL_EFFECTS: EffectFactory[] = [...EFFECTS, ...SPECIAL_EFFECTS];

export function findEffect(id: string): EffectFactory | undefined {
  return ALL_EFFECTS.find((e) => e.id === id);
}

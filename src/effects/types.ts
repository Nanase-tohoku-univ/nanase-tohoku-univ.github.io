import type * as THREE from 'three';
import type { Sfx } from '../audio/sfx';
import type { Rng } from '../core/seed';
import type { Palette } from './palette';

export interface EffectContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  rng: Rng;
  palette: Palette;
  /** 0.35..1 — grows as graduation approaches. */
  intensity: number;
  /** 0.25..1 — device performance budget. Multiply particle counts by this. */
  quality: number;
  /** Remaining days. */
  days: number;
  /** Text shaped by the effect, usually the remaining days. */
  label: string;
  /** Short caption for the effect's own in-scene text, e.g. "DAYS LEFT". */
  caption: string;
  /** Days already torn off, for effects that visualize the journey. */
  openedCount: number;
  totalDays: number;
  sfx: Sfx;
  haptic(pattern: number[]): void;
  post: PostControls;
  width: number;
  height: number;
}

export interface PostControls {
  shake(amount: number): void;
  flash(amount: number, color?: THREE.ColorRepresentation): void;
  setBloom(strength: number, radius?: number, threshold?: number): void;
  setAberration(amount: number): void;
  /** Radial zoom blur, 0 = off. */
  setWarp(amount: number): void;
  setVignette(amount: number): void;
}

export interface Effect {
  /** Seconds until the effect has fully formed the number. */
  readonly duration: number;
  /** Seconds at which the UI overlay should reveal the countdown text. */
  readonly revealAt: number;
  update(t: number, dt: number): void;
  resize?(width: number, height: number): void;
  /** Normalized device coordinates (-1..1). */
  tap?(x: number, y: number): void;
  dispose?(): void;
}

export interface EffectFactory {
  id: string;
  title: string;
  description: string;
  create(ctx: EffectContext): Effect;
}

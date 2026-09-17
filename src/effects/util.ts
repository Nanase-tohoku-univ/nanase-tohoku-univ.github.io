import * as THREE from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import type { Rng } from '../core/seed';

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t: number) => Math.pow(clamp(t), 3);
export const easeInOutCubic = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutElastic = (t: number) => {
  const x = clamp(t);
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
export const easeOutBack = (t: number) => {
  const x = clamp(t);
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Fires callbacks once when playback time passes their timestamp. */
export class Timeline {
  private events: Array<{ t: number; fn: () => void; done: boolean }> = [];
  at(t: number, fn: () => void): this {
    this.events.push({ t, fn, done: false });
    return this;
  }
  run(t: number): void {
    for (const e of this.events) {
      if (!e.done && t >= e.t) {
        e.done = true;
        e.fn();
      }
    }
  }
}

let cachedFont: Font | null = null;
export function getFont(): Font {
  if (!cachedFont) cachedFont = new FontLoader().parse(fontJson as never);
  return cachedFont;
}

/** Centered extruded text. */
export function textGeometry(text: string, size: number, depth: number, bevel = true): TextGeometry {
  const geo = new TextGeometry(text, {
    font: getFont(),
    size,
    depth,
    curveSegments: 6,
    bevelEnabled: bevel,
    bevelThickness: size * 0.04,
    bevelSize: size * 0.025,
    bevelSegments: 3,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, -(bb.max.z + bb.min.z) / 2);
  return geo;
}

export interface TextPoints {
  positions: Float32Array;
  width: number;
  height: number;
}

/**
 * Random points inside the rendered text. Output is centered at the origin,
 * `height` world units tall (cap height), with a little z jitter.
 */
export function sampleTextPoints(text: string, count: number, rng: Rng, height = 6, depthJitter = 0.3): TextPoints {
  const fontPx = 200;
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const font = `900 ${fontPx}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 20;
  canvas.width = w;
  canvas.height = Math.ceil(fontPx * 1.1);
  g.font = font;
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, w / 2, canvas.height / 2);
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;

  const pixels: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3] > 128) {
        pixels.push(x, y);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  const out = new Float32Array(count * 3);
  if (!pixels.length) return { positions: out, width: 0, height: 0 };
  const scale = height / Math.max(1, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const n = pixels.length / 2;
  for (let i = 0; i < count; i++) {
    const k = Math.floor(rng() * n) * 2;
    out[i * 3] = (pixels[k] + rng() * 2 - cx) * scale;
    out[i * 3 + 1] = -(pixels[k + 1] + rng() * 2 - cy) * scale;
    out[i * 3 + 2] = (rng() - 0.5) * depthJitter;
  }
  return { positions: out, width: (maxX - minX) * scale, height };
}

/** Binary mask of text on a grid of `cols` columns, e.g. for voxels or ASCII art. */
export function textMask(text: string, cols: number): { mask: boolean[][]; rows: number; cols: number } {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const fontPx = 120;
  const font = `900 ${fontPx}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.font = font;
  const tw = g.measureText(text).width;
  const pad = fontPx * 0.12;
  canvas.width = Math.ceil(tw + pad * 2);
  canvas.height = Math.ceil(fontPx * 0.95);
  g.font = font;
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + fontPx * 0.04);
  const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
  const cell = canvas.width / cols;
  const rows = Math.max(1, Math.round(canvas.height / cell));
  const mask: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      const x = Math.floor((c + 0.5) * cell);
      const y = Math.floor((r + 0.5) * (canvas.height / rows));
      row.push(data[(y * canvas.width + x) * 4 + 3] > 128);
    }
    mask.push(row);
  }
  return { mask, rows, cols };
}

export function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Soft round sprite for point particles. */
export function glowTexture(size = 64, hardness = 0.25): THREE.CanvasTexture {
  return canvasTexture(size, size, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(hardness, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Distance at which an object `worldWidth` wide fills `fill` of the viewport width (and fits height). */
export function fitDistance(camera: THREE.PerspectiveCamera, worldWidth: number, worldHeight: number, fill = 0.85): number {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dW = worldWidth / fill / 2 / Math.tan(hFov / 2);
  const dH = worldHeight / fill / 2 / Math.tan(vFov / 2);
  return Math.max(dW, dH);
}

/**
 * Pixels per world unit at distance 1 — multiply a world-space size by this and
 * divide by view depth to get gl_PointSize, independent of device resolution.
 */
export function pointScale(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): number {
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  return h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

/**
 * The bottom card covers the lower part of the screen, so formed text sits
 * above center: shift the camera target down by this fraction of text height.
 */
export const TEXT_LIFT = 0.45;

/** Round, fixed-pixel-size twinkling star points. */
export function starMaterial(size = 2.2, opacity = 0.8): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: size }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying float vTw;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float h = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_PointSize = uSize * (0.4 + h);
        vTw = h;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * uOpacity * (0.3 + 0.7 * vTw);
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      const uniforms = (m as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
      m.dispose();
    }
  });
}

/**
 * Shared GLSL noise helpers.
 *
 * snoise() is the 3D simplex noise from webgl-noise (https://github.com/ashima/webgl-noise):
 *   Description : Array and textureless GLSL 2D/3D/4D simplex noise functions.
 *   Author      : Ian McEwan, Ashima Arts.
 *   Copyright (C) 2011 Ashima Arts. All rights reserved.
 *   Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)
 *   Distributed under the MIT License. See THIRD_PARTY_NOTICES.md.
 * snoiseVec3()/curlNoise() below are local additions built on it.
 */
export const GLSL_NOISE = /* glsl */ `
// webgl-noise simplex noise: (C) 2011 Ashima Arts, (C) 2011-2016 Stefan Gustavson, MIT License
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 snoiseVec3(vec3 x){
  return vec3(snoise(x), snoise(vec3(x.y-19.1,x.z+33.4,x.x+47.2)), snoise(vec3(x.z+74.2,x.x-124.5,x.y+99.4)));
}
vec3 curlNoise(vec3 p){
  const float e=0.1;
  vec3 dx=vec3(e,0.0,0.0);vec3 dy=vec3(0.0,e,0.0);vec3 dz=vec3(0.0,0.0,e);
  vec3 px0=snoiseVec3(p-dx);vec3 px1=snoiseVec3(p+dx);
  vec3 py0=snoiseVec3(p-dy);vec3 py1=snoiseVec3(p+dy);
  vec3 pz0=snoiseVec3(p-dz);vec3 pz1=snoiseVec3(p+dz);
  float x=py1.z-py0.z-pz1.y+pz0.y;
  float y=pz1.x-pz0.x-px1.z+px0.z;
  float z=px1.y-px0.y-py1.x+py0.x;
  return vec3(x,y,z)/(2.0*e);
}
`;

import * as THREE from 'three';

/**
 * CPU particle pool rendered as additive soft points. Each particle carries its
 * own color, size, life, drag and gravity; optional spring target for text forming.
 */
export class ParticlePool {
  readonly max: number;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly col: Float32Array;
  readonly baseCol: Float32Array;
  readonly target: Float32Array;
  readonly size: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly drag: Float32Array;
  readonly gravity: Float32Array;
  readonly flags: Uint8Array; // 1 = alive, 2 = has target, 4 = twinkle, 8 = trail emitter, 16 = immortal
  readonly spring: Float32Array;
  readonly points: THREE.Points;
  private cursor = 0;
  private geo: THREE.BufferGeometry;
  private colorAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private posAttr: THREE.BufferAttribute;
  time = 0;

  /**
   * `pointScale` comes from util.pointScale(); particle `size` is in world units
   * multiplied by `sizeScale`.
   */
  constructor(max: number, pointScale: number, sizeScale = 0.1) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.baseCol = new Float32Array(max * 3);
    this.target = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.flags = new Uint8Array(max);
    this.spring = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('color', this.colorAttr);
    this.geo.setAttribute('aSize', this.sizeAttr);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: pointScale * sizeScale } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aSize;
        attribute vec3 color;
        varying vec3 vColor;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, aSize * uScale / -mv.z);
          vColor = color;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a * a * 1.8, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  /** Returns index of a free slot (recycling the oldest when full). */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, drag = 1, gravity = -3, flags = 0): number {
    let i = -1;
    for (let tries = 0; tries < 64; tries++) {
      const k = (this.cursor + tries) % this.max;
      if (!(this.flags[k] & 1)) {
        i = k;
        break;
      }
    }
    if (i < 0) {
      i = this.cursor;
      if (this.flags[i] & 16) {
        // never recycle immortal (text) particles; scan forward for a mortal one
        for (let k = 1; k < this.max; k++) {
          const j = (this.cursor + k) % this.max;
          if (!(this.flags[j] & 16)) {
            i = j;
            break;
          }
        }
      }
    }
    this.cursor = (i + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.baseCol[i3] = color.r;
    this.baseCol[i3 + 1] = color.g;
    this.baseCol[i3 + 2] = color.b;
    this.size[i] = size;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
    this.flags[i] = flags | 1;
    this.spring[i] = 0;
    return i;
  }

  setTarget(i: number, x: number, y: number, z: number, spring = 6): void {
    this.target[i * 3] = x;
    this.target[i * 3 + 1] = y;
    this.target[i * 3 + 2] = z;
    this.spring[i] = spring;
    this.flags[i] |= 2 | 16;
  }

  /** `onTrail` is called for particles with the trail flag at a throttled rate. */
  update(dt: number, onTrail?: (i: number) => void): void {
    this.time += dt;
    const { pos, vel, col, baseCol, life, maxLife, flags, size } = this;
    for (let i = 0; i < this.max; i++) {
      const f = flags[i];
      const i3 = i * 3;
      if (!(f & 1)) {
        col[i3] = col[i3 + 1] = col[i3 + 2] = 0;
        size[i] = 0;
        continue;
      }
      life[i] += dt;
      const immortal = (f & 16) !== 0;
      if (!immortal && life[i] >= maxLife[i]) {
        flags[i] = 0;
        col[i3] = col[i3 + 1] = col[i3 + 2] = 0;
        size[i] = 0;
        continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      if (f & 2) {
        const s = this.spring[i] * Math.min(1, life[i] * 2.5);
        vel[i3] += (this.target[i3] - pos[i3]) * s * dt;
        vel[i3 + 1] += (this.target[i3 + 1] - pos[i3 + 1]) * s * dt;
        vel[i3 + 2] += (this.target[i3 + 2] - pos[i3 + 2]) * s * dt;
        const damp = Math.exp(-(this.drag[i] + s * 0.5) * dt);
        vel[i3] *= damp;
        vel[i3 + 1] *= damp;
        vel[i3 + 2] *= damp;
      } else {
        vel[i3] *= k;
        vel[i3 + 1] = vel[i3 + 1] * k + this.gravity[i] * dt;
        vel[i3 + 2] *= k;
      }
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      let bright = immortal ? 1 : 1 - Math.pow(life[i] / maxLife[i], 2);
      if (f & 4) bright *= 0.4 + 0.6 * (Math.sin(life[i] * 30 + i) > 0 ? 1 : 0.15);
      col[i3] = baseCol[i3] * bright;
      col[i3 + 1] = baseCol[i3 + 1] * bright;
      col[i3 + 2] = baseCol[i3 + 2] * bright;
      if (f & 8 && onTrail && (i + Math.floor(this.time * 60)) % 3 === 0) onTrail(i);
    }
    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  setPointScale(pointScale: number, sizeScale = 0.1): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pointScale * sizeScale;
  }
}

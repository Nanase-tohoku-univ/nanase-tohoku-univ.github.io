import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Effect, EffectContext, EffectFactory, PostControls } from './types';
import { disposeObject } from './util';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAberr: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uVignette: { value: 0.35 },
    uWarp: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberr, uFlash, uVignette, uWarp;
    uniform vec3 uFlashColor;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      vec3 col = vec3(0.0);
      if (uWarp > 0.001) {
        float total = 0.0;
        for (int i = 0; i < 10; i++) {
          float s = 1.0 - uWarp * float(i) / 10.0 * 0.25;
          float w = 1.0 - float(i) / 10.0;
          col += texture2D(tDiffuse, 0.5 + dir * s).rgb * w;
          total += w;
        }
        col /= total;
      } else {
        float a = uAberr * 0.012 * length(dir);
        col.r = texture2D(tDiffuse, uv + dir * a).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - dir * a).b;
      }
      col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(dir * vec2(uRes.x / uRes.y, 1.0)));
      col += (hash(uv * uRes + uTime) - 0.5) * 0.035;
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface PlayOptions extends Omit<EffectContext, 'scene' | 'camera' | 'renderer' | 'post' | 'width' | 'height'> {
  onReveal?: () => void;
  onDone?: () => void;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private final: ShaderPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  private effect: Effect | null = null;
  private t = 0;
  private last = 0;
  private revealed = false;
  private finished = false;
  private opts: PlayOptions | null = null;
  private shakeAmt = 0;
  private flashAmt = 0;
  private raf = 0;
  private running = false;
  private frameTimes: number[] = [];
  quality: number;

  constructor(private canvas: HTMLCanvasElement) {
    this.quality = Stage.loadQuality();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.2, 0.6, 0.1);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.final);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private static loadQuality(): number {
    try {
      const q = Number(localStorage.getItem('fx-quality'));
      if (q >= 0.25 && q <= 1) return q;
    } catch {
      // ignore
    }
    return 1;
  }

  private saveQuality(): void {
    try {
      localStorage.setItem('fx-quality', String(this.quality));
    } catch {
      // ignore
    }
  }

  get size(): { width: number; height: number } {
    return { width: this.canvas.clientWidth || window.innerWidth, height: this.canvas.clientHeight || window.innerHeight };
  }

  resize(): void {
    const { width, height } = this.size;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * (0.5 + 0.5 * this.quality);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width * pr * 0.5, height * pr * 0.5);
    this.final.uniforms.uRes.value.set(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.effect?.resize?.(width, height);
  }

  private post: PostControls = {
    shake: (a) => {
      this.shakeAmt = Math.max(this.shakeAmt, a);
    },
    flash: (a, color = 0xffffff) => {
      this.flashAmt = Math.max(this.flashAmt, a);
      this.final.uniforms.uFlashColor.value.set(color);
    },
    setBloom: (strength, radius, threshold) => {
      this.bloom.strength = strength;
      if (radius !== undefined) this.bloom.radius = radius;
      if (threshold !== undefined) this.bloom.threshold = threshold;
    },
    setAberration: (a) => {
      this.final.uniforms.uAberr.value = a;
    },
    setWarp: (a) => {
      this.final.uniforms.uWarp.value = a;
    },
    setVignette: (a) => {
      this.final.uniforms.uVignette.value = a;
    },
  };

  play(factory: EffectFactory, opts: PlayOptions): void {
    this.clear();
    this.opts = opts;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, this.size.width / this.size.height, 0.1, 2000);
    this.camera.position.set(0, 0, 30);
    this.renderPass.scene = this.scene;
    this.renderPass.camera = this.camera;
    this.post.setBloom(1.1, 0.6, 0.1);
    this.post.setAberration(0.3);
    this.post.setWarp(0);
    this.post.setVignette(0.35);
    this.renderer.setClearColor(opts.palette.bg, 1);
    this.scene.background = opts.palette.bg.clone();
    this.t = 0;
    this.revealed = false;
    this.finished = false;
    this.frameTimes = [];
    const { width, height } = this.size;
    this.effect = factory.create({
      ...opts,
      quality: this.quality,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      post: this.post,
      width,
      height,
    });
    this.start();
  }

  /** Debug: advance the current effect to `target` seconds without rendering intermediate frames. */
  seek(target: number): void {
    if (!this.effect) return;
    const step = 1 / 30;
    while (this.t + step < target) {
      this.t += step;
      this.effect.update(this.t, step);
      this.flashAmt *= Math.pow(0.004, step);
      this.shakeAmt *= Math.pow(0.02, step);
    }
  }

  tap(clientX: number, clientY: number): void {
    const { width, height } = this.size;
    this.effect?.tap?.((clientX / width) * 2 - 1, -(clientY / height) * 2 + 1);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(dt: number): void {
    if (!this.effect || !this.opts) return;
    this.t += dt;
    this.effect.update(this.t, dt);

    if (!this.revealed && this.t >= this.effect.revealAt) {
      this.revealed = true;
      this.opts.onReveal?.();
    }
    if (!this.finished && this.t >= this.effect.duration) {
      this.finished = true;
      this.opts.onDone?.();
    }
    this.measure(dt);

    const s = this.shakeAmt;
    const cam = this.camera;
    const saved = cam.position.clone();
    if (s > 0.001) {
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    this.shakeAmt *= Math.pow(0.02, dt);
    this.final.uniforms.uFlash.value = this.flashAmt;
    this.flashAmt *= Math.pow(0.004, dt);
    this.final.uniforms.uTime.value = this.t;
    this.composer.render(dt);
    cam.position.copy(saved);
  }

  /** Lower the quality budget once if the first seconds run slowly. */
  private measure(dt: number): void {
    if (this.t < 0.5 || this.t > 3.5 || location.search.includes('lockq')) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length === 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      if (avg > 1 / 40 && this.quality > 0.25) {
        this.quality = Math.max(0.25, this.quality * 0.7);
        this.saveQuality();
        this.resize();
      } else if (avg < 1 / 57 && this.quality < 1) {
        this.quality = Math.min(1, this.quality + 0.1);
        this.saveQuality();
      }
    }
  }

  clear(): void {
    this.effect?.dispose?.();
    this.effect = null;
    disposeObject(this.scene);
    this.scene.clear();
    this.flashAmt = 0;
    this.shakeAmt = 0;
  }
}

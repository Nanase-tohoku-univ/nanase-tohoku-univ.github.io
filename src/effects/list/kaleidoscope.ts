import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { Timeline, canvasTexture, easeInOutCubic, smooth } from '../util';

export const kaleidoscope: EffectFactory = {
  id: 'kaleidoscope',
  title: '万華鏡フラクタル',
  description: 'ビートに合わせて無限にズームする万華鏡の中心から数字がほどけて現れる',
  create(ctx) {
    const { scene, rng, palette, intensity, sfx, post } = ctx;
    const tw = 1024;
    const th = 512;
    const textTex = canvasTexture(tw, th, (g, w, h) => {
      const size = Math.min(h * 0.8, (w * 0.9) / Math.max(1, ctx.label.length * 0.62));
      g.font = `900 ${size}px "Arial Black", "Helvetica Neue", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = '#fff';
      g.shadowBlur = 40;
      g.fillStyle = '#fff';
      g.fillText(ctx.label, w / 2, h / 2 + size * 0.04);
      g.shadowBlur = 0;
      g.fillText(ctx.label, w / 2, h / 2 + size * 0.04);
    });

    const segs = rng.pick([6, 8, 10, 12]);
    const uniforms = {
      uT: { value: 0 },
      uAspect: { value: ctx.width / ctx.height },
      uSeg: { value: segs },
      uZoom: { value: 0 },
      uBeat: { value: 0 },
      uUnfold: { value: 0 },
      uTextK: { value: 0 },
      uC: { value: new THREE.Vector2(rng.range(0.6, 0.9), rng.range(0.3, 0.6)) },
      tText: { value: textTex },
      uC0: { value: palette.colors[0] },
      uC1: { value: palette.colors[1] },
      uC2: { value: palette.colors[2] },
      uC3: { value: palette.colors[3] },
      uHot: { value: palette.hot },
    };
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms,
        depthTest: false,
        depthWrite: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uT, uAspect, uSeg, uZoom, uBeat, uUnfold, uTextK;
          uniform vec2 uC;
          uniform sampler2D tText;
          uniform vec3 uC0, uC1, uC2, uC3, uHot;
          varying vec2 vUv;
          const float PI = 3.14159265;

          vec2 fold(vec2 p, float n){
            float r = length(p);
            float a = atan(p.y, p.x) + uT * 0.15;
            float seg = 2.0 * PI / n;
            a = mod(a, seg);
            a = abs(a - seg * 0.5);
            return r * vec2(cos(a), sin(a));
          }

          vec3 pal(float t){
            vec3 a = mix(uC0, uC1, 0.5 + 0.5 * sin(t * 6.2831));
            vec3 b = mix(uC2, uC3, 0.5 + 0.5 * cos(t * 6.2831 * 1.3));
            return mix(a, b, 0.5 + 0.5 * sin(t * 3.1));
          }

          void main(){
            vec2 p0 = (vUv - 0.5) * vec2(uAspect, 1.0);
            p0.y -= 0.12;
            vec2 p = fold(p0, uSeg);

            // infinite zoom: blend two octaves of the fractal so the loop is seamless
            float z = fract(uZoom);
            vec3 col = vec3(0.0);
            for (int o = 0; o < 2; o++) {
              float scale = pow(2.0, z + float(o) - 1.0);
              float w = o == 0 ? z : 1.0 - z;
              vec2 q = p / scale * 1.4;
              float acc = 0.0;
              float trap = 1e9;
              for (int i = 0; i < 11; i++) {
                q = abs(q) / clamp(dot(q, q), 0.08, 4.0) - uC;
                trap = min(trap, abs(q.x * q.y));
                acc += exp(-length(q) * 2.5);
              }
              vec3 c = pal(acc * 0.15 + uT * 0.05) * smoothstep(0.0, 6.0, acc) * 0.9;
              c += uHot * exp(-trap * 300.0) * 0.25;
              col += c * w;
            }
            col = col / (1.0 + col);
            col *= 0.6 + uBeat * 0.6;
            col *= smoothstep(1.6, 0.0, length(p0));

            // number: sampled through the mirror fold, gradually unfolding to the real position
            vec2 tp = mix(p, p0, uUnfold);
            float boxW = min(uAspect * 0.92, 0.9);
            vec2 tuv = tp / vec2(boxW, boxW * 0.5) + 0.5;
            float ta = 0.0;
            if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) ta = texture2D(tText, tuv).a;
            vec3 textCol = mix(uHot, uC3, 0.3) * (1.0 + uBeat * 0.5);
            float k = ta * uTextK * mix(0.45, 1.0, uUnfold);
            col = mix(col * (1.0 - k * 0.6), textCol, k);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    mesh.frustumCulled = false;
    scene.add(mesh);

    const bpm = 128;
    const beat = 60 / bpm;
    const tUnfold = 5.0;
    const tl = new Timeline();
    for (let i = 0; i < Math.floor(9 / beat); i++) {
      const at = 0.2 + i * beat;
      tl.at(at, () => {
        if (at < tUnfold + 1.5) sfx.boom(0.25 + (i % 4 === 0 ? 0.25 : 0));
        uniforms.uBeat.value = 1;
        if (i % 4 === 0) ctx.haptic([0, 25]);
      });
      if (at < tUnfold) tl.at(at + beat / 2, () => sfx.tick(0, 6000));
    }
    tl.at(tUnfold - 1.5, () => sfx.riser(1.5)).at(tUnfold, () => {
      sfx.boom(1.2);
      sfx.chord(0.05, 233.08, 3);
      sfx.sparkle(24, 0.1, 1.5);
      post.flash(0.6, palette.hot);
      post.shake(1 + intensity);
      ctx.haptic([0, 150]);
    });

    return {
      duration: tUnfold + 2.8,
      revealAt: tUnfold + 1.4,
      update(t, dt) {
        tl.run(t);
        uniforms.uT.value = t;
        const speed = t < tUnfold ? 0.35 + smooth(0, tUnfold, t) * 1.2 : 0.12;
        uniforms.uZoom.value += dt * speed;
        uniforms.uBeat.value *= Math.exp(-dt * 7);
        uniforms.uTextK.value = smooth(1.0, 2.5, t);
        uniforms.uUnfold.value = easeInOutCubic(smooth(tUnfold - 0.2, tUnfold + 1.2, t));
        uniforms.uSeg.value = segs;
        post.setBloom(0.7, 0.45, 0.6);
        post.setAberration(0.6 + uniforms.uBeat.value * 1.5);
      },
      resize(w, h) {
        uniforms.uAspect.value = w / h;
      },
    };
  },
};

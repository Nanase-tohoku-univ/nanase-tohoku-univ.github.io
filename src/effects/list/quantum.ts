import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { TEXT_LIFT, Timeline, canvasTexture, fitDistance, pointScale, sampleTextPoints, smooth } from '../util';

export const quantum: EffectFactory = {
  id: 'quantum',
  title: '量子もつれ',
  description: '数字が重ね合わせ状態で揺らぎ、画面をタップして観測した瞬間に確定する',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    scene.background = new THREE.Color(0x02010a);
    const textH = 6;
    const lift = -textH * TEXT_LIFT;
    const label = ctx.label;

    // digit atlas 0-9 (plus the label's own characters if non-numeric)
    const glyphs = Array.from(new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ...label]));
    const atlas = canvasTexture(128 * glyphs.length, 160, (g, w, h) => {
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '900 140px "Arial Black", "Helvetica Neue", sans-serif';
      glyphs.forEach((ch, i) => g.fillText(ch, (i + 0.5) * (w / glyphs.length), h / 2 + 6));
    });

    const chars = [...label];
    const charW = textH * 0.72;
    const totalW = charW * chars.length;
    const dist = fitDistance(camera, totalW, textH, 0.8);
    const ghostsPer = Math.floor(18 + 12 * quality);
    const n = ghostsPer * chars.length;
    const geo = new THREE.PlaneGeometry(charW, textH * 1.12);
    const aSlot = new Float32Array(n);
    const aTrue = new Float32Array(n);
    const aRand = new Float32Array(n * 4);
    for (let j = 0; j < chars.length; j++) {
      for (let k = 0; k < ghostsPer; k++) {
        const i = j * ghostsPer + k;
        aSlot[i] = j;
        aTrue[i] = glyphs.indexOf(chars[j]);
        // aRand.w === 0 marks the one ghost per slot that survives observation
        aRand.set([rng(), rng(), rng(), k === 0 ? 0 : 0.2 + rng() * 0.8], i * 4);
      }
    }
    geo.setAttribute('aSlot', new THREE.InstancedBufferAttribute(aSlot, 1));
    geo.setAttribute('aTrue', new THREE.InstancedBufferAttribute(aTrue, 1));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(aRand, 4));
    const u = {
      tAtlas: { value: atlas },
      uT: { value: 0 },
      uCollapse: { value: 0 },
      uCount: { value: glyphs.length },
      uSlots: { value: chars.length },
      uCharW: { value: charW },
      uC1: { value: palette.colors[1] },
      uC3: { value: palette.colors[3] },
      uHot: { value: palette.hot },
    };
    const ghostMat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uT, uCollapse, uCount, uSlots, uCharW;
        attribute float aSlot, aTrue; attribute vec4 aRand;
        varying vec2 vUv; varying float vGlyph, vAlpha, vTrue; varying vec3 vWorld;
        void main(){
          float amp = 1.0 - uCollapse;
          float flick = floor(uT * (3.0 + aRand.x * 9.0) + aRand.y * 10.0);
          float g = mod(floor(aRand.z * uCount) + flick, 10.0);
          vTrue = 1.0 - step(0.001, aRand.w);
          vGlyph = uCollapse > 0.0 ? aTrue : g;
          vec3 off = vec3(sin(uT * (1.0 + aRand.x * 3.0) + aRand.y * 20.0), cos(uT * (1.3 + aRand.y * 2.0) + aRand.z * 20.0), sin(uT * 0.7 + aRand.w * 20.0) * 3.0) * amp * vec3(1.4, 1.0, 1.0);
          vec3 p = position * (1.0 + (aRand.x - 0.5) * 0.6 * amp);
          p.x += (aSlot - (uSlots - 1.0) * 0.5) * uCharW;
          p += off;
          vUv = uv;
          vAlpha = mix(0.055, vTrue * 0.9, uCollapse);
          vec4 w = modelMatrix * vec4(p, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAtlas; uniform float uT, uCollapse, uCount; uniform vec3 uC1, uC3, uHot;
        varying vec2 vUv; varying float vGlyph, vAlpha, vTrue; varying vec3 vWorld;
        void main(){
          vec2 uv = vec2((vGlyph + vUv.x) / uCount, vUv.y);
          float a = texture2D(tAtlas, uv).a;
          if (a < 0.02) discard;
          float fringe = 0.55 + 0.45 * sin(vWorld.x * 6.0 + vWorld.y * 3.0 - uT * 5.0);
          vec3 col = mix(mix(uC1, uC3, fringe), uHot, uCollapse * vTrue);
          float k = mix(fringe, 1.0, uCollapse);
          gl_FragColor = vec4(col * a * vAlpha * k, 1.0);
        }`,
    });
    const ghosts = new THREE.InstancedMesh(geo, ghostMat, n);
    ghosts.frustumCulled = false;
    const id = new THREE.Matrix4();
    for (let i = 0; i < n; i++) ghosts.setMatrixAt(i, id);
    scene.add(ghosts);

    // probability cloud (orbital lobes) that implodes into the number outline
    const cloudN = Math.floor(9000 * quality) + 2000;
    const tp = sampleTextPoints(label, cloudN, rng, textH, 0.3);
    const cPos = new Float32Array(cloudN * 3);
    const cRand = new Float32Array(cloudN * 3);
    for (let i = 0; i < cloudN; i++) {
      // sample a d-orbital-ish density by rejection
      let x = 0;
      let y = 0;
      let z = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = (rng() - 0.5) * 2;
        y = (rng() - 0.5) * 2;
        z = (rng() - 0.5) * 2;
        const r2 = x * x + y * y + z * z;
        const dens = Math.pow(x * x - y * y, 2) / (r2 + 1e-3) * Math.exp(-r2 * 2) * 6;
        if (rng() < dens) break;
      }
      cPos.set([x * 14, y * 14, z * 14], i * 3);
      cRand.set([rng(), rng(), rng()], i * 3);
    }
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
    cGeo.setAttribute('aTarget', new THREE.BufferAttribute(tp.positions, 3));
    cGeo.setAttribute('aRand', new THREE.BufferAttribute(cRand, 3));
    cGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const cu = { uT: { value: 0 }, uCollapse: { value: 0 }, uScale: { value: pointScale(ctx.renderer, camera) }, uC: { value: palette.colors[2] }, uC2: { value: palette.colors[0] } };
    const cloud = new THREE.Points(
      cGeo,
      new THREE.ShaderMaterial({
        uniforms: cu,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uT, uCollapse, uScale; attribute vec3 aTarget; attribute vec3 aRand; varying float vA; varying float vR;
          mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
          mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
          void main(){
            vec3 p = rotY(uT * 0.4) * rotX(uT * 0.23) * position;
            float k = clamp((uCollapse - aRand.x * 0.3) / 0.7, 0.0, 1.0);
            k = 1.0 - pow(1.0 - k, 3.0);
            p = mix(p, aTarget, k);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = max(1.0, (0.05 + aRand.y * 0.06) * uScale / -mv.z);
            vA = mix(0.45, 0.1, k); vR = aRand.z;
          }`,
        fragmentShader: `uniform vec3 uC, uC2; varying float vA; varying float vR;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(mix(uC, uC2, vR) * a * vA, 1.0); }`,
      }),
    );
    scene.add(cloud);

    // observation prompt
    const promptTex = canvasTexture(1024, 160, (g, w, h) => {
      g.fillStyle = '#fff';
      g.font = 'bold 64px "Consolas", "Menlo", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('[ TAP TO OBSERVE ]', w / 2, h / 2);
    });
    const promptMat = new THREE.MeshBasicMaterial({ map: promptTex, transparent: true, opacity: 0, depthWrite: false, color: palette.colors[3] });
    const prompt = new THREE.Mesh(new THREE.PlaneGeometry(totalW * 0.9, totalW * 0.9 * 0.156), promptMat);
    prompt.position.set(0, -textH * 0.95, 0);
    scene.add(prompt);

    // collapse shockwave rings
    const ringMat = new THREE.MeshBasicMaterial({ color: palette.hot, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 96), ringMat);
    scene.add(ring);

    camera.position.set(0, lift, dist);
    camera.lookAt(0, lift, 0);

    const autoCollapse = 6.2;
    let tCollapse = Infinity;
    let now = 0;
    const collapse = () => {
      if (tCollapse !== Infinity || now < 1.2) return;
      tCollapse = now;
      sfx.boom(1.3);
      sfx.glitch(0.2);
      sfx.chord(0.1, 277.18, 3);
      sfx.sparkle(30, 0.1, 1.6);
      post.flash(0.9, palette.hot);
      post.shake(1.5 + intensity * 2);
      post.setAberration(4);
      ctx.haptic([0, 40, 30, 200]);
    };
    const tl = new Timeline().at(0.1, () => sfx.drone(6, 0, 46.25));
    for (let i = 0; i < 20; i++) tl.at(0.4 + i * 0.3, () => tCollapse === Infinity && sfx.tick(0, 300 + rng() * 3000));

    return {
      get duration() {
        return Math.min(tCollapse, autoCollapse) + 2.6;
      },
      get revealAt() {
        return Math.min(tCollapse, autoCollapse) + 1.3;
      },
      update(t, dt) {
        now = t;
        tl.run(t);
        if (t >= autoCollapse) collapse();
        const c = tCollapse === Infinity ? 0 : smooth(tCollapse, tCollapse + 0.5, t);
        u.uT.value = t;
        u.uCollapse.value = c;
        cu.uT.value = t;
        cu.uCollapse.value = tCollapse === Infinity ? 0 : smooth(tCollapse, tCollapse + 1.6, t);
        promptMat.opacity = tCollapse === Infinity ? smooth(1.5, 2.2, t) * (0.55 + 0.45 * Math.sin(t * 5)) : Math.max(0, promptMat.opacity - dt * 4);
        if (tCollapse !== Infinity) {
          const te = t - tCollapse;
          ring.scale.setScalar(1 + te * 30);
          ringMat.opacity = Math.max(0, 1 - te * 0.8);
          post.setAberration(Math.max(0.4, 4 - te * 5));
        } else {
          post.setAberration(0.8 + Math.sin(t * 7) * 0.4);
        }
        post.setBloom(0.7, 0.45, 0.5);
      },
      tap() {
        collapse();
      },
    };
  },
};

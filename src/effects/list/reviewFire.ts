import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { ParticlePool } from '../particles';
import { TEXT_LIFT, Timeline, canvasTexture, fitDistance, lerp, pointScale, sampleTextPoints, smooth } from '../util';

const COMMENTS = [
  ['Reviewer 2', 'The novelty of this work', 'is unclear.', 'Please compare with', '[47 more baselines].'],
  ['査読者 2', '提案手法の優位性が', '十分に示されていない．', '追加実験を要する．'],
  ['Reviewer 3', 'The English should be', 'checked by a native', 'speaker.'],
  ['Reviewer 1', 'Figure 3 is too small', 'to read. Also Fig. 4.', 'Also Fig. 5.'],
  ['指導教員', 'この章，全部', '書き直しましょう．', '（赤ペン 214箇所）'],
  ['Reviewer 2', 'Why did the authors not', 'simply solve', 'the problem instead?'],
  ['Meta-Review', 'The reviewers agree', 'that the paper has', 'potential, however...'],
  ['査読者 1', '参考文献の書式が', '統一されていない．', '誤字: 32箇所'],
];
const STAMPS = ['REJECT', 'MAJOR REVISION', '再提出', 'BORDERLINE', '要修正'];
const AX = 4;
const AY = 2;

export const reviewFire: EffectFactory = {
  id: 'review-fire',
  title: '査読コメント火葬',
  description: '辛辣な査読コメントが一斉に燃え上がり、火の粉が残り日数となって輝く',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    scene.background = new THREE.Color(0x050203);
    const textH = 6;
    const lift = -textH * TEXT_LIFT;

    const atlas = canvasTexture(256 * AX * 2, 256 * AY * 2, (g, w, h) => {
      const cw = w / AX;
      const ch = h / AY;
      COMMENTS.forEach((lines, i) => {
        const x = (i % AX) * cw;
        const y = Math.floor(i / AX) * ch;
        g.fillStyle = '#fbfaf5';
        g.fillRect(x + 20, y + 20, cw - 40, ch - 40);
        g.fillStyle = '#e8e3d6';
        g.fillRect(x + 20, y + 20, cw - 40, 70);
        g.fillStyle = '#222';
        g.font = 'bold 40px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
        g.fillText(lines[0], x + 44, y + 70);
        g.font = '34px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
        g.fillStyle = '#333';
        lines.slice(1).forEach((l, k) => g.fillText(l, x + 44, y + 150 + k * 52));
        g.save();
        g.translate(x + cw * 0.58, y + ch * 0.78);
        g.rotate(-0.25);
        g.strokeStyle = 'rgba(210,20,30,0.85)';
        g.fillStyle = 'rgba(210,20,30,0.85)';
        g.lineWidth = 8;
        g.font = '900 54px "Arial Black", sans-serif';
        const stamp = STAMPS[i % STAMPS.length];
        const tw = g.measureText(stamp).width;
        g.strokeRect(-tw / 2 - 18, -40, tw + 36, 80);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(stamp, 0, 2);
        g.restore();
      });
    });

    const cardCount = Math.floor(26 + 18 * intensity);
    const cardW = 3.2;
    const cardH = 3.2;
    const cardGeo = new THREE.PlaneGeometry(cardW, cardH);
    const cards: Array<{ mesh: THREE.Mesh; u: { uBurn: { value: number } }; p: THREE.Vector3; v: THREE.Vector3; spin: THREE.Vector3; burnAt: number }> = [];
    const tIgnite = 2.2;
    for (let i = 0; i < cardCount; i++) {
      const idx = i % COMMENTS.length;
      const u = {
        tMap: { value: atlas },
        uBurn: { value: 0 },
        uSeed: { value: rng() * 100 },
        uOffset: { value: new THREE.Vector2((idx % AX) / AX, 1 - (Math.floor(idx / AX) + 1) / AY) },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        side: THREE.DoubleSide,
        transparent: true,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tMap; uniform float uBurn, uSeed; uniform vec2 uOffset; varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          void main(){
            vec4 c = texture2D(tMap, uOffset + vUv * vec2(${1 / AX}, ${1 / AY}));
            if (c.a < 0.1 || (c.r > 0.99 && c.g > 0.99 && c.b > 0.99 && false)) discard;
            float n = noise(vUv * 5.0 + uSeed) * 0.6 + noise(vUv * 13.0 + uSeed) * 0.3 + (1.0 - vUv.y) * 0.25;
            float th = uBurn * 1.25;
            if (n < th - 0.02) discard;
            float edge = smoothstep(th + 0.1, th, n);
            vec3 col = mix(c.rgb * 0.72, vec3(0.12, 0.05, 0.02), smoothstep(th + 0.2, th + 0.04, n) * step(0.001, uBurn));
            col += vec3(3.0, 1.1, 0.2) * edge * step(0.001, uBurn);
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      const mesh = new THREE.Mesh(cardGeo, mat);
      scene.add(mesh);
      cards.push({
        mesh,
        u,
        p: new THREE.Vector3((rng() - 0.5) * 16, 6 + rng() * 20, (rng() - 0.5) * 10 - 4),
        v: new THREE.Vector3((rng() - 0.5) * 2, -5 - rng() * 4, 0),
        spin: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(3),
        burnAt: tIgnite + rng() * 1.4,
      });
    }

    // fire glow at the bottom
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 60),
      new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uK: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uT, uK; varying vec2 vUv;
          void main(){ float f = pow(1.0 - vUv.y, 3.0) * (0.8 + 0.2 * sin(uT * 7.0 + vUv.x * 20.0)); gl_FragColor = vec4(vec3(1.0, 0.35, 0.08) * f * uK, 1.0); }`,
      }),
    );
    glow.position.set(0, -20, -20);
    scene.add(glow);

    const pool = new ParticlePool(Math.floor(16000 * quality) + 3000, pointScale(ctx.renderer, camera), 0.12);
    scene.add(pool.points);
    const n = Math.floor(3000 * (0.5 + 0.5 * quality) * (0.7 + 0.3 * intensity));
    const text = sampleTextPoints(ctx.label, n, rng, textH, 0.4);
    const dist = fitDistance(camera, text.width, textH, 0.8);
    camera.position.set(0, lift, dist + 4);
    camera.lookAt(0, lift, 0);

    const ember = new THREE.Color();
    const tForm = 4.4;
    const tl = new Timeline()
      .at(0.1, () => sfx.whoosh(1.2))
      .at(tIgnite, () => {
        sfx.whoosh(1.5);
        sfx.crackle(3.5);
        sfx.boom(0.6);
        post.flash(0.35, 0xff7a20);
        ctx.haptic([0, 50]);
      })
      .at(tForm - 0.8, () => sfx.riser(0.8))
      .at(tForm, () => {
        sfx.boom(1.1);
        post.shake(1 + intensity);
        post.flash(0.4, 0xffa040);
        ctx.haptic([0, 120, 40, 80]);
        const hot = [new THREE.Color(1, 0.55, 0.12), new THREE.Color(1, 0.8, 0.3), palette.colors[2].clone().lerp(new THREE.Color(1, 0.6, 0.2), 0.7)];
        for (let i = 0; i < n; i++) {
          const c = cards[i % cards.length];
          ember.copy(rng.pick(hot));
          const idx = pool.spawn(c.p.x + (rng() - 0.5) * cardW, c.p.y + (rng() - 0.5) * cardH, c.p.z, (rng() - 0.5) * 6, rng() * 8, (rng() - 0.5) * 6, ember, 0.9 + rng() * 0.9, 999, 1.2, 0, rng() < 0.3 ? 4 : 0);
          pool.setTarget(idx, text.positions[i * 3], text.positions[i * 3 + 1], text.positions[i * 3 + 2], 10 + rng() * 10);
        }
      })
      .at(tForm + 1.5, () => {
        sfx.chord(0, 196, 3);
        sfx.sparkle(20, 0, 1.5);
      });

    const e = new THREE.Euler();
    return {
      duration: tForm + 3.2,
      revealAt: tForm + 2.0,
      update(t, dt) {
        tl.run(t);
        for (const c of cards) {
          // flutter down, then rise with the heat
          const burning = t >= c.burnAt;
          c.v.y += (burning ? 6 : -1.5) * dt;
          c.v.x += Math.sin(t * 2 + c.spin.x * 10) * 2 * dt;
          c.v.multiplyScalar(Math.exp(-1.2 * dt));
          if (!burning && c.p.y < lift - 2) c.v.y = Math.max(c.v.y, 0);
          c.p.addScaledVector(c.v, dt);
          c.mesh.position.copy(c.p);
          e.set(Math.sin(t * c.spin.x) * 0.8, t * c.spin.y * 0.5, Math.sin(t * c.spin.z) * 0.4);
          c.mesh.rotation.copy(e);
          c.u.uBurn.value = smooth(c.burnAt, c.burnAt + 1.6, t);
          const b = c.u.uBurn.value;
          if (b > 0 && b < 1 && rng() < 0.9) {
            for (let k = 0; k < 3; k++) {
              ember.setRGB(1, 0.4 + rng() * 0.4, 0.1);
              pool.spawn(c.p.x + (rng() - 0.5) * cardW, c.p.y + (rng() - 0.5) * cardH, c.p.z, (rng() - 0.5) * 2, 2 + rng() * 4, (rng() - 0.5) * 2, ember, 0.6 + rng() * 0.8, 0.8 + rng() * 1.2, 0.8, 2.5, 4);
            }
          }
          c.mesh.visible = b < 1;
        }
        // rising sparks from the finished number
        if (t > tForm + 2) {
          for (let k = 0; k < 4; k++) {
            const i = Math.floor(rng() * n);
            ember.setRGB(1, 0.5 + rng() * 0.3, 0.15);
            pool.spawn(text.positions[i * 3], text.positions[i * 3 + 1], 0, (rng() - 0.5), 1 + rng() * 2, 0, ember, 0.5, 1.5, 0.5, 1.5);
          }
        }
        pool.update(dt);
        const gm = glow.material as THREE.ShaderMaterial;
        gm.uniforms.uT.value = t;
        gm.uniforms.uK.value = smooth(tIgnite, tIgnite + 1, t) * lerp(1, 0.4, smooth(tForm, tForm + 2, t));
        camera.position.z = lerp(dist + 4, dist, smooth(tForm, tForm + 2, t));
        post.setBloom(0.9, 0.5, t < tForm ? 0.85 : 0.4);
      },
    };
  },
};

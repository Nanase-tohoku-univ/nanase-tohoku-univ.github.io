import * as THREE from 'three';
import type { EffectFactory } from '../types';
import type { Rng } from '../../core/seed';
import { ParticlePool } from '../particles';
import { Timeline, canvasTexture, easeOutBack, pointScale, sampleTextPoints, smooth } from '../util';

function boltGeometry(rng: Rng, from: THREE.Vector3, to: THREE.Vector3, width: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [from.clone()];
  const segs = 14;
  for (let i = 1; i < segs; i++) {
    const p = from.clone().lerp(to, i / segs);
    p.x += (rng() - 0.5) * width * 18;
    pts.push(p);
  }
  pts.push(to.clone());
  const pos: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const w = width * (1 - i / pts.length * 0.7);
    pos.push(a.x - w, a.y, 0, a.x + w, a.y, 0, b.x + w, b.y, 0, a.x - w, a.y, 0, b.x + w, b.y, 0, b.x - w, b.y, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

export const calligraphy: EffectFactory = {
  id: 'calligraphy',
  title: '書道雷神',
  description: '和紙に墨で数字が書き上がり、落雷で黄金に変わって落款が押される',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    const d = 20;
    camera.position.set(0, 0, d);
    camera.lookAt(0, 0, 0);
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d;
    const vw = vh * camera.aspect;
    const lift = vh * 0.1;

    const paper = canvasTexture(512, 1024, (g, w, h) => {
      g.fillStyle = '#f3ecdc';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        g.strokeStyle = `rgba(${150 + rng() * 60},${130 + rng() * 50},${90 + rng() * 40},${0.05 + rng() * 0.08})`;
        g.lineWidth = rng() * 1.5;
        g.beginPath();
        const x = rng() * w;
        const y = rng() * h;
        g.moveTo(x, y);
        g.quadraticCurveTo(x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 30, x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 60);
        g.stroke();
      }
    });

    // ink canvas: rough brush digits
    const iw = 1024;
    const ih = Math.round(iw * (vh / vw));
    let inkBounds = { x0: iw, x1: 0 };
    const ink = canvasTexture(iw, ih, (g, w, h) => {
      const size = Math.min((w * 0.9) / Math.max(1, ctx.label.length * 0.62), h * 0.3);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${size}px "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif`;
      const cy = h / 2 - h * 0.1;
      for (let k = 0; k < 26; k++) {
        g.fillStyle = `rgba(0,0,0,${0.08 + rng() * 0.08})`;
        g.save();
        g.translate(w / 2 + (rng() - 0.5) * size * 0.05, cy + (rng() - 0.5) * size * 0.05);
        g.rotate((rng() - 0.5) * 0.03);
        g.scale(1 + (rng() - 0.5) * 0.04, 1 + (rng() - 0.5) * 0.04);
        g.fillText(ctx.label, 0, 0);
        g.restore();
      }
      const tw = g.measureText(ctx.label).width;
      inkBounds = { x0: (w - tw) / 2, x1: (w + tw) / 2 };
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${0.5 + rng() * 0.5})`;
        g.beginPath();
        g.arc(inkBounds.x0 + rng() * tw, cy + (rng() - 0.5) * size * 1.4, rng() * rng() * 10, 0, Math.PI * 2);
        g.fill();
      }
    });

    const uniforms = {
      tPaper: { value: paper },
      tInk: { value: ink },
      uProgress: { value: 0 },
      uStorm: { value: 0 },
      uGold: { value: 0 },
      uT: { value: 0 },
      uX0: { value: 0 },
      uX1: { value: 1 },
      uGoldA: { value: new THREE.Color('#ffd76a') },
      uGoldB: { value: palette.colors[2].clone().lerp(new THREE.Color('#ff9a1f'), 0.6) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tPaper, tInk; uniform float uProgress, uStorm, uGold, uT, uX0, uX1; uniform vec3 uGoldA, uGoldB;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec3 paper = texture2D(tPaper, vUv * vec2(1.0, 1.0)).rgb;
          float inkA = texture2D(tInk, vUv).a;
          // stroke order: left → right, each column swept top → bottom with a ragged front
          float x = clamp((vUv.x - uX0) / max(uX1 - uX0, 1e-3), 0.0, 1.0);
          float order = x * 0.92 + (1.0 - vUv.y) * 0.08 + (noise(vUv * 40.0) - 0.5) * 0.04;
          float shown = smoothstep(order - 0.02, order + 0.005, uProgress * 1.05);
          float bleed = noise(vUv * 120.0) * 0.25;
          float a = smoothstep(0.1 + bleed * 0.3, 0.6, inkA) * shown;
          vec3 storm = mix(paper, paper * vec3(0.18, 0.2, 0.28), uStorm);
          vec3 inkCol = vec3(0.03, 0.03, 0.04);
          float sheen = 0.5 + 0.5 * sin(vUv.x * 30.0 + vUv.y * 20.0 - uT * 4.0);
          vec3 gold = mix(uGoldB, uGoldA, sheen) * (0.9 + 0.8 * pow(sheen, 8.0));
          vec3 col = mix(storm, mix(inkCol, gold, uGold), a);
          // faint bleed halo
          col = mix(col, col * 0.85, smoothstep(0.02, 0.2, inkA) * (1.0 - a) * shown * (1.0 - uGold));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(vw * 1.06, vh * 1.06), mat);
    scene.add(sheet);

    // brush tip
    const brush = new THREE.Mesh(
      new THREE.CircleGeometry(vh * 0.02, 24),
      new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0 }),
    );
    brush.position.z = 0.05;
    scene.add(brush);

    // lightning bolts
    const bolts = new THREE.Group();
    scene.add(bolts);
    const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1.2).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const strike = () => {
      bolts.clear();
      const tx = (rng() - 0.5) * vw * 0.6;
      bolts.add(new THREE.Mesh(boltGeometry(rng, new THREE.Vector3(tx + (rng() - 0.5) * vw * 0.4, vh * 0.55, 0.1), new THREE.Vector3(tx, lift, 0.1), vh * 0.004), boltMat));
      for (let k = 0; k < 2; k++) {
        const y = lift + rng() * vh * 0.3;
        bolts.add(new THREE.Mesh(boltGeometry(rng, new THREE.Vector3(tx + (rng() - 0.5) * vw * 0.2, y, 0.1), new THREE.Vector3(tx + (rng() - 0.5) * vw * 0.5, y - vh * 0.15, 0.1), vh * 0.002), boltMat));
      }
      boltMat.opacity = 1;
      sfx.zap();
      post.flash(0.9, 0xdde8ff);
      post.shake(1.2 + intensity);
      ctx.haptic([0, 60, 30, 120]);
    };

    // gold sparks
    const sparks = new ParticlePool(Math.floor(3000 * quality) + 500, pointScale(ctx.renderer, camera), 0.25);
    scene.add(sparks.points);
    const inkPts = sampleTextPoints(ctx.label, 600, rng, vh * 0.2, 0);

    // hanko seal
    const seal = new THREE.Mesh(
      new THREE.PlaneGeometry(vh * 0.11, vh * 0.11),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        map: canvasTexture(256, 256, (g, w, h) => {
          g.fillStyle = '#c1121f';
          g.fillRect(8, 8, w - 16, h - 16);
          g.strokeStyle = '#f3ecdc';
          g.lineWidth = 10;
          g.strokeRect(26, 26, w - 52, h - 52);
          g.fillStyle = '#f3ecdc';
          g.font = '900 88px "Yu Mincho", "Noto Serif CJK JP", serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('修', w / 2, h * 0.32);
          g.fillText('了', w / 2, h * 0.7);
          for (let i = 0; i < 300; i++) {
            g.clearRect(rng() * w, rng() * h, rng() * 5, rng() * 5);
          }
        }),
      }),
    );
    const sealX = Math.min(vw * 0.32, vh * 0.3);
    seal.position.set(sealX, lift - vh * 0.16, 0.2);
    scene.add(seal);

    const tWrite = 0.9;
    const tWriteEnd = 4.0;
    const tStorm = 4.3;
    const tGold = 5.5;
    const tSeal = 6.4;
    const tl = new Timeline()
      .at(0.05, () => sfx.boom(0.6))
      .at(0.45, () => sfx.boom(0.6))
      .at(tStorm, () => sfx.drone(2, 0, 36.7))
      .at(tStorm + 0.4, strike)
      .at(tStorm + 0.85, strike)
      .at(tGold - 0.05, strike)
      .at(tGold, () => {
        sfx.sparkle(30, 0.05, 1.2);
        const c = new THREE.Color('#ffd76a');
        for (let i = 0; i < inkPts.positions.length / 3; i++) {
          const a = rng() * Math.PI * 2;
          const sp = 2 + rng() * 8;
          sparks.spawn(inkPts.positions[i * 3], inkPts.positions[i * 3 + 1] + lift, 0.3, Math.cos(a) * sp, Math.sin(a) * sp + 3, 0, c, 1 + rng(), 1 + rng() * 1.5, 2, -6, 4);
        }
      })
      .at(tSeal, () => {
        sfx.boom(1);
        post.shake(0.8);
        ctx.haptic([0, 90]);
      })
      .at(tSeal + 0.3, () => sfx.chord(0, 220, 2.5));
    const strokes = Math.max(2, ctx.label.length);
    for (let i = 0; i < strokes; i++) tl.at(tWrite + (i / strokes) * (tWriteEnd - tWrite), () => sfx.whoosh(0.5));

    uniforms.uX0.value = inkBounds.x0 / iw;
    uniforms.uX1.value = inkBounds.x1 / iw;
    return {
      duration: tSeal + 1.8,
      revealAt: tSeal + 0.6,
      update(t, dt) {
        tl.run(t);
        uniforms.uT.value = t;
        const p = smooth(tWrite, tWriteEnd, t);
        uniforms.uProgress.value = p;
        uniforms.uStorm.value = smooth(tStorm, tStorm + 0.5, t) * (1 - smooth(tSeal, tSeal + 1.5, t) * 0.25);
        uniforms.uGold.value = smooth(tGold, tGold + 0.4, t);

        // brush follows the writing front
        const writing = t > tWrite && t < tWriteEnd;
        (brush.material as THREE.MeshBasicMaterial).opacity = writing ? 0.85 : Math.max(0, (brush.material as THREE.MeshBasicMaterial).opacity - dt * 3);
        const bx = (uniforms.uX0.value + (uniforms.uX1.value - uniforms.uX0.value) * p - 0.5) * vw;
        const zig = Math.sin(p * strokes * Math.PI * 6);
        brush.position.set(bx, lift + zig * vh * 0.09, 0.05);
        brush.scale.setScalar(1 + Math.abs(zig) * 0.5);

        boltMat.opacity = Math.max(0, boltMat.opacity - dt * 5);
        sparks.update(dt);

        const sealK = smooth(tSeal - 0.25, tSeal, t);
        (seal.material as THREE.MeshBasicMaterial).opacity = sealK;
        seal.scale.setScalar(t < tSeal ? 3 - 2 * sealK : easeOutBack(1));
        seal.rotation.z = -0.12 + (1 - sealK) * 0.4;

        camera.position.set(0, 0, d - smooth(tStorm, tSeal + 1, t) * 1.5);
        camera.lookAt(0, 0, 0);
        post.setBloom(uniforms.uGold.value * 0.6 + 0.15, 0.4, 0.75);
        post.setVignette(0.35 + uniforms.uStorm.value * 0.4);
      },
    };
  },
};

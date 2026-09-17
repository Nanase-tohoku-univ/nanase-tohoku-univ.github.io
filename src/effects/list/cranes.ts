import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { TEXT_LIFT, Timeline, easeInOutCubic, fitDistance, lerp, sampleTextPoints, smooth } from '../util';

/** Low-poly origami crane; wing vertices have |x| > 0.25 so the shader can flap them. */
function craneGeometry(): THREE.BufferGeometry {
  const v = {
    head: [0, 0.35, 0.9],
    beak: [0, 0.25, 1.05],
    neckBase: [0, 0, 0.25],
    tail: [0, 0.45, -0.95],
    tailBase: [0, 0, -0.25],
    top: [0, 0.18, 0],
    bottom: [0, -0.25, 0],
    wingL: [-1.25, 0.15, -0.1],
    wingR: [1.25, 0.15, -0.1],
    wingLm: [-0.3, 0.05, 0.05],
    wingRm: [0.3, 0.05, 0.05],
    sideL: [-0.14, -0.05, 0],
    sideR: [0.14, -0.05, 0],
  };
  const tris: number[][][] = [
    // neck & head
    [v.neckBase, v.sideL, v.head], [v.neckBase, v.head, v.sideR], [v.head, v.beak, v.sideL],
    // tail
    [v.tailBase, v.tail, v.sideL], [v.tailBase, v.sideR, v.tail],
    // body
    [v.top, v.sideL, v.bottom], [v.top, v.bottom, v.sideR], [v.neckBase, v.sideL, v.tailBase], [v.neckBase, v.tailBase, v.sideR],
    // wings
    [v.top, v.wingLm, v.wingL], [v.wingLm, v.sideL, v.wingL], [v.top, v.wingR, v.wingRm], [v.wingRm, v.wingR, v.sideR],
  ];
  const pos: number[] = [];
  for (const t of tris) for (const p of t) pos.push(...p);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export const cranes: EffectFactory = {
  id: 'cranes',
  title: '折り鶴ワープ',
  description: '千羽の折り鶴が光速ワープを抜け、星座となって数字を描く',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    scene.background = palette.bg.clone();
    const textH = 6;
    const lift = -textH * TEXT_LIFT;

    const n = Math.floor(900 * (0.5 + 0.5 * quality) * (0.7 + 0.3 * intensity));
    const text = sampleTextPoints(ctx.label, n, rng, textH, 0.3);
    const dist = fitDistance(camera, text.width, textH, 0.8);

    // flapping crane material
    const flap = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide, flatShading: true, emissive: palette.colors[1], emissiveIntensity: 0.15 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlap = flap;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uFlap;\nattribute float aPhase;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat wing = smoothstep(0.2, 1.25, abs(transformed.x));\ntransformed.y += sin(uFlap * (9.0 + aPhase * 4.0) + aPhase * 6.28) * wing * 0.7;');
    };
    const geo = craneGeometry();
    const phases = new Float32Array(n);
    for (let i = 0; i < n; i++) phases[i] = rng();
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    const flock = new THREE.InstancedMesh(geo, mat, n);
    flock.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flock.frustumCulled = false;
    const paper = [new THREE.Color(0xffffff), palette.colors[3], palette.colors[2], new THREE.Color('#ffd6e0'), new THREE.Color('#fff3b0')];
    for (let i = 0; i < n; i++) flock.setColorAt(i, rng.pick(paper));
    scene.add(flock);
    scene.add(new THREE.HemisphereLight(0xffffff, palette.colors[0], 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 5, 8);
    scene.add(key);

    // warp streaks
    const streakCount = Math.floor(1400 * quality) + 300;
    const sPos = new Float32Array(streakCount * 6);
    const sCol = new Float32Array(streakCount * 6);
    const streakZ = new Float32Array(streakCount);
    const streakXY = new Float32Array(streakCount * 2);
    for (let i = 0; i < streakCount; i++) {
      const a = rng() * Math.PI * 2;
      const r = 3 + rng() * 40;
      streakXY[i * 2] = Math.cos(a) * r;
      streakXY[i * 2 + 1] = Math.sin(a) * r;
      streakZ[i] = -rng() * 400;
      const c = rng.pick(palette.colors);
      sCol.set([c.r, c.g, c.b, c.r * 0.1, c.g * 0.1, c.b * 0.1], i * 6);
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    streakGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    const streakMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const streaks = new THREE.LineSegments(streakGeo, streakMat);
    streaks.frustumCulled = false;
    scene.add(streaks);

    // constellation lines between nearby targets
    const linePos: number[] = [];
    const tp = text.positions;
    const maxEdges = Math.floor(n * 1.2);
    const cellSize = textH / 9;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const k = `${Math.floor(tp[i * 3] / cellSize)},${Math.floor(tp[i * 3 + 1] / cellSize)}`;
      (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
    }
    for (const list of grid.values()) {
      for (let a = 0; a < list.length && linePos.length / 6 < maxEdges; a++) {
        const i = list[a];
        const j = list[(a + 1) % list.length];
        if (i === j) continue;
        linePos.push(tp[i * 3], tp[i * 3 + 1], tp[i * 3 + 2], tp[j * 3], tp[j * 3 + 1], tp[j * 3 + 2]);
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: palette.colors[2], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    scene.add(new THREE.LineSegments(lineGeo, lineMat));

    // per-crane state
    const st = Array.from({ length: n }, () => ({
      off: new THREE.Vector3((rng() - 0.5) * 18, (rng() - 0.5) * 12, (rng() - 0.5) * 30),
      p: new THREE.Vector3(),
      delay: rng() * 0.9,
      s: 0.22 + rng() * 0.14,
    }));

    const tWarp = 1.2;
    const tArrive = 4.6;
    const tl = new Timeline()
      .at(0.05, () => {
        sfx.tear();
        sfx.sparkle(10, 0.1, 0.6);
        post.flash(0.6, 0xffffff);
      })
      .at(tWarp - 0.2, () => sfx.riser(tArrive - tWarp))
      .at(tWarp, () => ctx.haptic([0, 40]))
      .at(tArrive, () => {
        sfx.boom(0.9);
        post.flash(0.5, palette.colors[3]);
        post.shake(0.6 + intensity);
        ctx.haptic([0, 100]);
      })
      .at(tArrive + 1.6, () => {
        sfx.chord(0, 220, 3);
        sfx.sparkle(30, 0, 2);
      });

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const look = new THREE.Matrix4();
    const prev = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    return {
      duration: tArrive + 3.2,
      revealAt: tArrive + 2.0,
      update(t, dt) {
        tl.run(t);
        flap.value = t;
        const warp = smooth(tWarp, tWarp + 1, t) * (1 - smooth(tArrive - 0.8, tArrive, t));
        post.setWarp(warp * 1.2);
        post.setBloom(0.7 + warp * 0.6, 0.5, 0.3);

        // streaks rush toward the camera during warp
        const speed = lerp(15, 420, warp);
        for (let i = 0; i < streakCount; i++) {
          streakZ[i] += speed * dt;
          if (streakZ[i] > dist + 5) streakZ[i] -= 400;
          const len = 0.5 + warp * 25;
          const x = streakXY[i * 2];
          const y = streakXY[i * 2 + 1] + lift;
          sPos.set([x, y, streakZ[i], x, y, streakZ[i] - len], i * 6);
        }
        streakGeo.attributes.position.needsUpdate = true;
        streakMat.opacity = 0.25 + warp * 0.75;

        const arrive = t < tArrive - 1 ? 0 : 1;
        for (let i = 0; i < n; i++) {
          const c = st[i];
          prev.copy(c.p);
          if (!arrive) {
            // burst from one sheet of paper, then swarm in a flowing tube
            const burst = easeInOutCubic(smooth(0, 1.0, t));
            const w = t * 1.3 + c.delay * 5;
            c.p.set(
              c.off.x * burst + Math.sin(w + i) * 1.5 * burst,
              c.off.y * burst + Math.cos(w * 0.8 + i) * 1.2 * burst + lift,
              lerp(dist - 6, c.off.z * 0.5 - 10, burst),
            );
          } else {
            tgt.set(tp[i * 3], tp[i * 3 + 1], tp[i * 3 + 2]);
            const k = easeInOutCubic(smooth(tArrive - 1 + c.delay * 0.6, tArrive + 0.9 + c.delay, t));
            const from = new THREE.Vector3(c.off.x, c.off.y + lift, c.off.z * 0.5 - 10);
            c.p.lerpVectors(from, tgt, k);
            c.p.y += Math.sin(t * 2 + i) * 0.04 * k;
          }
          if (prev.distanceToSquared(c.p) > 1e-6 && t > 0.05) {
            look.lookAt(c.p, prev, up);
            q.setFromRotationMatrix(look);
          }
          const settle = smooth(tArrive + 0.5, tArrive + 2, t);
          sc.setScalar(c.s * lerp(1, 0.75, settle));
          m4.compose(c.p, q, sc);
          flock.setMatrixAt(i, m4);
        }
        flock.instanceMatrix.needsUpdate = true;
        lineMat.opacity = smooth(tArrive + 1, tArrive + 2.5, t) * 0.5;

        camera.position.set(Math.sin(t * 0.4) * 1.5 * (1 - smooth(tArrive, tArrive + 1.5, t)), lift, dist);
        camera.lookAt(0, lift, 0);
      },
    };
  },
};

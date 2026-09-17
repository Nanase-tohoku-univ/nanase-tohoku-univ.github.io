import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { TEXT_LIFT, Timeline, fitDistance, lerp, sampleTextPoints, smooth } from '../util';

export const confetti: EffectFactory = {
  id: 'confetti',
  title: '紙吹雪バレットタイム',
  description: '数千枚の紙吹雪がスローモーションで舞い、時間が加速した瞬間に数字へ吸い込まれる',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    scene.background = palette.bg.clone();
    const textH = 6;
    const lift = -textH * TEXT_LIFT;
    const n = Math.floor(2600 * (0.4 + 0.6 * quality) * (0.7 + 0.3 * intensity));
    const text = sampleTextPoints(ctx.label, n, rng, textH, 0.2);
    const dist = fitDistance(camera, text.width, textH, 0.8);
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    const vw = vh * camera.aspect;

    const geo = new THREE.PlaneGeometry(0.2, 0.11);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.4, metalness: 0.35 });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const cols = [...palette.colors, palette.hot, new THREE.Color('#ffd166'), new THREE.Color('#ffffff')];
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0xffffff, palette.colors[0], 1.6));
    const spot = new THREE.DirectionalLight(0xffffff, 2.2);
    spot.position.set(-4, 8, 10);
    scene.add(spot);

    // spotlight beams from the corners
    const beamMat = new THREE.MeshBasicMaterial({ color: palette.colors[2], transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(vw * 0.28, vh * 2.2, 32, 1, true), beamMat);
      beam.position.set(sx * vw * 0.55, lift - vh * 0.1, -6);
      beam.rotation.z = sx * 0.55 + Math.PI;
      scene.add(beam);
    }

    const P = Array.from({ length: n }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      mesh.setColorAt(i, rng.pick(cols));
      const ang = rng.range(0.9, 1.35);
      const sp = rng.range(10, 26);
      return {
        p: new THREE.Vector3(side * vw * 0.5, lift - vh * 0.5, rng.range(-2, 2)),
        v: new THREE.Vector3(-side * Math.cos(ang) * sp, Math.sin(ang) * sp, rng.range(-4, 4)),
        r: new THREE.Euler(rng() * 6, rng() * 6, rng() * 6),
        w: new THREE.Vector3(rng.range(-8, 8), rng.range(-8, 8), rng.range(-8, 8)),
        phase: rng() * 6.28,
        launch: rng() * 0.35,
      };
    });

    const tSlow = 0.45;
    const tResume = 2.6;
    const tAttract = 4.0;
    const tl = new Timeline()
      .at(0.02, () => {
        sfx.boom(0.9);
        sfx.whoosh(0.4);
        post.flash(0.3, 0xffffff);
        ctx.haptic([0, 80]);
      })
      .at(tSlow, () => sfx.drone(tResume - tSlow, 0, 55))
      .at(tSlow + 0.2, () => sfx.riser(tResume - tSlow - 0.2))
      .at(tResume, () => {
        sfx.boom(1.2);
        sfx.whoosh(1);
        post.shake(1.5 + intensity);
        post.flash(0.4, palette.colors[3]);
        ctx.haptic([0, 150]);
      })
      .at(tAttract, () => sfx.whoosh(1.5))
      .at(tAttract + 1.3, () => {
        sfx.chord(0, 261.63, 3);
        sfx.sparkle(30, 0, 1.8);
      });

    let sim = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const tgt = new THREE.Vector3();
    const faceCam = new THREE.Quaternion();
    return {
      duration: tAttract + 3,
      revealAt: tAttract + 1.8,
      update(t, dt) {
        tl.run(t);
        const scale = t < tSlow ? 1 : t < tResume ? lerp(0.07, 0.03, smooth(tSlow, tResume, t)) : 1;
        const sdt = dt * scale;
        sim += sdt;
        post.setAberration(t > tSlow && t < tResume ? 1.5 : 0.4);
        post.setVignette(t > tSlow && t < tResume ? 0.7 : 0.35);

        for (let i = 0; i < n; i++) {
          const c = P[i];
          if (sim < c.launch) continue;
          if (t < tAttract) {
            c.v.y -= 6 * sdt;
            // flutter: drag depends on orientation
            c.v.x += Math.sin(sim * 4 + c.phase) * 3 * sdt;
            c.v.multiplyScalar(Math.exp(-1.1 * sdt));
            if (t > tResume) {
              // vortex around the center
              const dx = c.p.x;
              const dy = c.p.y - lift;
              const d = Math.hypot(dx, dy) + 0.5;
              c.v.x += (-dy / d) * 30 * sdt - dx * 0.8 * sdt;
              c.v.y += (dx / d) * 30 * sdt - dy * 0.8 * sdt + 6 * sdt;
            }
          } else {
            tgt.set(text.positions[i * 3], text.positions[i * 3 + 1], text.positions[i * 3 + 2]);
            const k = 30 * smooth(tAttract, tAttract + 0.6 + (i / n) * 0.8, t);
            c.v.addScaledVector(tgt.sub(c.p), k * sdt).multiplyScalar(Math.exp(-(2 + k * 0.35) * sdt));
          }
          c.p.addScaledVector(c.v, sdt);
          const settle = smooth(tAttract + 0.8, tAttract + 2.2, t);
          c.r.x += c.w.x * sdt * (1 - settle * 0.9);
          c.r.y += c.w.y * sdt * (1 - settle * 0.9);
          c.r.z += c.w.z * sdt * (1 - settle * 0.9);
          q.setFromEuler(c.r);
          if (settle > 0) {
            faceCam.setFromEuler(new THREE.Euler(Math.sin(t * 3 + c.phase) * 0.35, Math.cos(t * 2.5 + c.phase) * 0.35, c.phase));
            q.slerp(faceCam, settle);
          }
          m4.compose(c.p, q, one);
          mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;

        const bullet = t > tSlow && t < tResume ? smooth(tSlow, tResume, t) : 0;
        const orbit = bullet * 1.2;
        camera.position.set(Math.sin(orbit) * dist, lift, Math.cos(orbit) * dist);
        camera.lookAt(0, lift + (t < tResume ? vh * 0.1 : 0), 0);
        post.setBloom(0.5, 0.4, 0.7);
      },
    };
  },
};

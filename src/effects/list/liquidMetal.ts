import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EffectFactory } from '../types';
import { TEXT_LIFT, Timeline, easeOutElastic, fitDistance, lerp, smooth, textGeometry } from '../util';

export const liquidMetal: EffectFactory = {
  id: 'liquid-metal',
  title: '液体金属',
  description: '水銀のメタボールが融合して海に沈み、金属の数字がせり上がる',
  create(ctx) {
    const { scene, camera, renderer, rng, palette, intensity, quality, sfx, post } = ctx;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.background = palette.bg.clone().lerp(new THREE.Color(0x000000), 0.4);
    scene.fog = new THREE.Fog(scene.background, 30, 90);

    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dce6, metalness: 1, roughness: 0.08, envMapIntensity: 1.3 });

    // colored lights so the chrome picks up the palette
    const lights = palette.colors.map((c, i) => {
      const l = new THREE.PointLight(c, 120, 60);
      l.position.set(Math.cos(i * 1.6) * 14, 6 + i, Math.sin(i * 1.6) * 14);
      scene.add(l);
      return l;
    });
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    // mercury sea
    const segs = Math.floor(90 + 70 * quality);
    const seaGeo = new THREE.PlaneGeometry(120, 120, segs, segs);
    seaGeo.rotateX(-Math.PI / 2);
    const seaPos = seaGeo.attributes.position as THREE.BufferAttribute;
    const base = Float32Array.from(seaPos.array as Float32Array);
    const sea = new THREE.Mesh(seaGeo, metal);
    sea.position.y = -4;
    scene.add(sea);

    // metaballs
    const res = Math.floor(28 + 20 * quality);
    const blobs = new MarchingCubes(res, metal, false, false, 60000);
    blobs.scale.setScalar(9);
    blobs.position.y = 4;
    scene.add(blobs);
    const ballCount = Math.floor(7 + 5 * intensity);
    const balls = Array.from({ length: ballCount }, () => ({ a: rng() * 6.28, b: rng() * 6.28, sa: rng.range(0.4, 1.2), sb: rng.range(0.3, 1.0) }));

    // number
    const textSize = 5;
    const tgeo = textGeometry(ctx.label, textSize, 2.2);
    tgeo.computeBoundingBox();
    const tw = tgeo.boundingBox!.max.x - tgeo.boundingBox!.min.x;
    const textMat = metal.clone();
    textMat.color = new THREE.Color(0xeef0ff).lerp(palette.colors[3], 0.25);
    const text = new THREE.Mesh(tgeo, textMat);
    text.position.y = -12;
    scene.add(text);

    // droplets
    const dropCount = Math.floor(260 * quality + 80);
    const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 10, 8), metal, dropCount);
    drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dropState = Array.from({ length: dropCount }, () => ({ p: new THREE.Vector3(0, -100, 0), v: new THREE.Vector3(), s: 0.5 + rng() * 1.5, alive: false }));
    scene.add(drops);
    const m4 = new THREE.Matrix4();
    const splash = (x: number, z: number, n: number, power: number) => {
      let k = 0;
      for (const d of dropState) {
        if (d.alive) continue;
        d.alive = true;
        const a = rng() * Math.PI * 2;
        const sp = rng() * 6 * power;
        d.p.set(x + Math.cos(a) * rng() * 2, sea.position.y, z + Math.sin(a) * rng() * 2);
        d.v.set(Math.cos(a) * sp, 8 + rng() * 12 * power, Math.sin(a) * sp);
        if (++k >= n) break;
      }
    };

    const ripples: Array<{ x: number; z: number; t0: number; amp: number }> = [];
    const finalDist = fitDistance(camera, tw, textSize, 0.8);
    const tPlunge = 3.2;
    const tRise = 4.3;
    const tl = new Timeline()
      .at(0.1, () => sfx.drone(4, 0, 41.2))
      .at(tPlunge, () => {
        ripples.push({ x: 0, z: 0, t0: tPlunge, amp: 1.2 });
        splash(0, 0, dropCount * 0.6, 1.2);
        sfx.boom(0.9);
        sfx.whoosh(0.8);
        post.shake(1.2);
        ctx.haptic([0, 90]);
      })
      .at(tRise - 0.6, () => sfx.riser(1.2))
      .at(tRise, () => {
        ripples.push({ x: 0, z: 0, t0: tRise, amp: 1.8 });
        splash(0, 0, dropCount * 0.4, 1.5);
        sfx.boom(1.2);
        post.flash(0.35, palette.colors[2]);
        post.shake(1.5 + intensity);
        ctx.haptic([0, 120, 40, 160]);
      })
      .at(tRise + 1.3, () => {
        sfx.chord(0, 164.81);
        sfx.sparkle(18, 0, 1.2);
      });

    return {
      duration: 8.3,
      revealAt: tRise + 1.8,
      update(t, dt) {
        tl.run(t);

        // metaballs orbit, merge, then fall into the sea
        const fall = smooth(tPlunge - 0.9, tPlunge, t);
        blobs.visible = t < tPlunge + 0.1;
        if (blobs.visible) {
          blobs.reset();
          const merge = smooth(1.2, tPlunge - 0.6, t);
          for (const b of balls) {
            const r = lerp(0.32, 0.03, merge);
            const x = 0.5 + Math.cos(b.a + t * b.sa) * r;
            const y = 0.5 + Math.sin(b.b + t * b.sb) * r * 0.8 - fall * 0.9;
            const z = 0.5 + Math.sin(b.a + t * b.sb) * r;
            blobs.addBall(x, y, z, lerp(0.35, 0.55, merge), 12);
          }
          blobs.update();
        }

        // sea waves + ripples
        const arr = seaPos.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          const x = base[i];
          const z = base[i + 2];
          let y = Math.sin(x * 0.18 + t * 1.3) * 0.25 + Math.sin(z * 0.23 - t * 1.1) * 0.25 + Math.sin((x + z) * 0.4 + t * 2) * 0.08;
          for (const r of ripples) {
            const age = t - r.t0;
            if (age < 0 || age > 6) continue;
            const d = Math.hypot(x - r.x, z - r.z);
            const front = age * 9;
            y += Math.sin((d - front) * 0.9) * Math.exp(-Math.pow((d - front) * 0.25, 2)) * r.amp * Math.exp(-age * 0.5);
          }
          arr[i + 1] = y;
        }
        seaPos.needsUpdate = true;
        if (Math.floor(t * 30) % 2 === 0) seaGeo.computeVertexNormals();

        // number rising
        const rise = t < tRise ? 0 : easeOutElastic(Math.min(1, (t - tRise) / 2.2));
        text.position.y = lerp(-12, sea.position.y + textSize * 0.95, rise);
        text.rotation.y = Math.sin(t * 0.7) * 0.25 * (1 - smooth(tRise + 2, tRise + 4, t) * 0.6);
        text.rotation.x = -0.1;

        // droplets
        let i = 0;
        for (const d of dropState) {
          if (d.alive) {
            d.v.y -= 25 * dt;
            d.p.addScaledVector(d.v, dt);
            if (d.p.y < sea.position.y - 0.5) d.alive = false;
          }
          m4.makeScale(d.s, d.s, d.s).setPosition(d.alive ? d.p : new THREE.Vector3(0, -100, 0));
          drops.setMatrixAt(i++, m4);
        }
        drops.instanceMatrix.needsUpdate = true;

        lights.forEach((l, k) => {
          l.position.set(Math.cos(t * 0.5 + k * 1.6) * 14, 5 + Math.sin(t + k) * 3, Math.sin(t * 0.5 + k * 1.6) * 14);
        });

        const settle = smooth(tRise, tRise + 2.5, t);
        const textY = sea.position.y + textSize * 0.95;
        const lookY = lerp(2, textY - textSize * TEXT_LIFT, settle);
        const orbit = lerp(t * 0.25, 0, settle);
        const dist = lerp(26, finalDist + 2, settle);
        camera.position.set(Math.sin(orbit) * dist, lerp(9, textY - textSize * TEXT_LIFT + 1.5, settle), Math.cos(orbit) * dist);
        camera.lookAt(0, lookY, 0);
        post.setBloom(0.45, 0.4, 0.6);
      },
      dispose() {
        envRT.dispose();
        pmrem.dispose();
        blobs.geometry.dispose();
      },
    };
  },
};

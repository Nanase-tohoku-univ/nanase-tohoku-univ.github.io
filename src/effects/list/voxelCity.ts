import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { ParticlePool } from '../particles';
import { Timeline, canvasTexture, easeInCubic, easeOutBack, fitDistance, lerp, pointScale, smooth, textMask } from '../util';

export const voxelCity: EffectFactory = {
  id: 'voxel-city',
  title: 'ボクセル都市ドミノ',
  description: '夜の街が連鎖的に倒壊し、真上から見ると光る数字のビル群だけが残る',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    scene.background = palette.bg.clone();
    scene.fog = new THREE.Fog(palette.bg, 40, 140);

    const cols = Math.min(72, Math.max(34, Math.round(ctx.label.length * 14 * (0.7 + 0.3 * quality))));
    const { mask, rows } = textMask(ctx.label, cols);
    const pad = 6;
    const gw = cols + pad * 2;
    const gh = rows + pad * 2 + 6;
    const cell = 1;
    const ox = -(gw * cell) / 2;
    const oz = -(gh * cell) / 2;

    const windows = canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = '#0b0d14';
      g.fillRect(0, 0, w, h);
      for (let y = 4; y < h; y += 10)
        for (let x = 4; x < w; x += 10) {
          g.fillStyle = Math.random() < 0.35 ? `rgba(255,${200 + Math.random() * 55},${120 + Math.random() * 100},0.9)` : 'rgba(40,50,70,0.8)';
          g.fillRect(x, y, 5, 6);
        }
    });
    windows.wrapS = windows.wrapT = THREE.RepeatWrapping;

    type B = { x: number; z: number; h: number; text: boolean; delay: number; dir: number; idx: number };
    const buildings: B[] = [];
    const textBuildings: B[] = [];
    const wave = new THREE.Vector2(rng() < 0.5 ? -1 : 1, rng() < 0.5 ? -1 : 1);
    for (let z = 0; z < gh; z++)
      for (let x = 0; x < gw; x++) {
        const mr = z - pad - 3;
        const mc = x - pad;
        const isText = mr >= 0 && mr < rows && mc >= 0 && mc < cols && mask[mr][mc];
        const wx = ox + x * cell + cell / 2;
        const wz = oz + z * cell + cell / 2;
        const d = (wx * wave.x + wz * wave.y) / (gw + gh) + 0.5;
        const b: B = { x: wx, z: wz, h: isText ? 1 : 0.6 + Math.pow(rng(), 2.5) * 7, text: isText, delay: d * 2.6 + rng() * 0.15, dir: Math.floor(rng() * 4), idx: 0 };
        if (isText) {
          b.idx = textBuildings.length;
          textBuildings.push(b);
        } else {
          b.idx = buildings.length;
          buildings.push(b);
        }
      }

    const boxGeo = new THREE.BoxGeometry(cell * 0.86, 1, cell * 0.86);
    boxGeo.translate(0, 0.5, 0);
    const cityMat = new THREE.MeshStandardMaterial({ map: windows, emissiveMap: windows, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.6, roughness: 0.7, metalness: 0.2 });
    const city = new THREE.InstancedMesh(boxGeo, cityMat, buildings.length);
    city.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(city);
    const tint = [palette.colors[0], palette.colors[1], new THREE.Color(0x9aa4b8), new THREE.Color(0x6c7488)];
    buildings.forEach((_, i) => city.setColorAt(i, tint[Math.floor(rng() * tint.length)].clone().lerp(new THREE.Color(1, 1, 1), 0.4)));

    const neonMat = new THREE.MeshBasicMaterial({ color: palette.hot });
    const neon = new THREE.InstancedMesh(boxGeo, neonMat, Math.max(1, textBuildings.length));
    neon.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    textBuildings.forEach((_, i) => neon.setColorAt(i, palette.colors[2].clone().lerp(palette.hot, rng() * 0.6)));
    scene.add(neon);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: palette.bg.clone().lerp(new THREE.Color(0x222633), 0.6), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    scene.add(new THREE.HemisphereLight(palette.colors[1], 0x080810, 0.6));
    const moon = new THREE.DirectionalLight(0xbfd4ff, 1.2);
    moon.position.set(-20, 40, 10);
    scene.add(moon);

    const dust = new ParticlePool(Math.floor(9000 * quality) + 1000, pointScale(ctx.renderer, camera), 0.35);
    scene.add(dust.points);
    const dustCol = new THREE.Color(0x8c8577);

    const tStart = 2.4;
    const tTop = tStart + 3.4;
    const tl = new Timeline()
      .at(0.1, () => sfx.drone(tStart + 0.5, 0, 49))
      .at(tStart, () => {
        sfx.boom(0.8);
        post.shake(0.8);
        ctx.haptic([0, 60]);
      })
      .at(tTop - 0.4, () => sfx.riser(0.6))
      .at(tTop + 0.2, () => {
        sfx.boom(1.1);
        sfx.chord(0.1, 196, 3);
        sfx.sparkle(24, 0.2, 1.5);
        post.flash(0.4, palette.colors[2]);
        post.shake(1 + intensity);
        ctx.haptic([0, 120, 40, 120]);
      });
    for (let i = 0; i < 14; i++) tl.at(tStart + 0.2 + i * 0.2, () => sfx.boom(0.25 + rng() * 0.2));

    const m4 = new THREE.Matrix4();
    const pivot = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    const back = new THREE.Matrix4();
    const scale = new THREE.Matrix4();
    const fallen = new Uint8Array(buildings.length);
    const finalH = 4 + intensity * 3;
    const topDist = fitDistance(camera, gw * cell, gh * cell, 0.95);

    return {
      duration: tTop + 2.6,
      revealAt: tTop + 1.0,
      update(t, dt) {
        tl.run(t);
        const tw = t - tStart;
        for (const b of buildings) {
          const f = tw < 0 ? 0 : easeInCubic(smooth(b.delay, b.delay + 0.55, tw));
          const angle = f * (Math.PI / 2) * 0.98;
          const hx = cell * 0.43;
          const dirs = [
            [hx, 0, 0, 0, 0, -1],
            [-hx, 0, 0, 0, 0, 1],
            [0, 0, hx, 1, 0, 0],
            [0, 0, -hx, -1, 0, 0],
          ][b.dir];
          scale.makeScale(1, b.h, 1);
          pivot.makeTranslation(b.x + dirs[0], 0, b.z + dirs[2]);
          rot.makeRotationAxis(new THREE.Vector3(dirs[3], dirs[4], dirs[5]), angle);
          back.makeTranslation(-dirs[0], 0, -dirs[2]);
          m4.copy(pivot).multiply(rot).multiply(back).multiply(scale);
          city.setMatrixAt(b.idx, m4);
          if (f >= 0.97 && !fallen[b.idx]) {
            fallen[b.idx] = 1;
            const n = Math.floor(3 + b.h * 1.5 * quality);
            for (let k = 0; k < n; k++)
              dust.spawn(b.x + (rng() - 0.5) * b.h, 0.3 + rng() * 0.6, b.z + (rng() - 0.5) * b.h, (rng() - 0.5) * 3, rng() * 2.5, (rng() - 0.5) * 3, dustCol, 1 + rng() * 1.5, 1.6 + rng(), 1.5, -0.6);
          }
        }
        city.instanceMatrix.needsUpdate = true;

        for (const b of textBuildings) {
          const grow = tw < 0 ? 0 : easeOutBack(smooth(b.delay + 0.2, b.delay + 1.1, tw));
          const h = lerp(0.8 + ((b.x * 7.1 + b.z * 3.3) % 1.5 + 1.5) % 1.5, finalH, grow);
          m4.makeScale(1, h, 1).setPosition(b.x, 0, b.z);
          neon.setMatrixAt(b.idx, m4);
        }
        neon.instanceMatrix.needsUpdate = true;
        neonMat.color.copy(palette.hot).multiplyScalar(lerp(0.35, 2.4, smooth(tTop - 1, tTop + 0.5, t)));
        dust.update(dt);

        // camera: low fly-over → crane up to a top-down view where the text reads upright
        const top = smooth(tStart + 1.2, tTop + 0.4, t);
        const e = easeInCubic(top) * 0.4 + top * 0.6;
        const fly = t * 0.8;
        const low = new THREE.Vector3(Math.sin(fly * 0.25) * 12 + wave.x * -10, 9, oz - 14 + fly * 3);
        const high = new THREE.Vector3(0, topDist, 0.01 + gh * cell * 0.22);
        camera.position.copy(low.lerp(high, e));
        camera.up.set(0, 1, 0).lerp(new THREE.Vector3(0, 0, -1), e).normalize();
        camera.lookAt(lerp(0, 0, e), 0, lerp(oz * 0.2, gh * cell * 0.22, e));
        post.setBloom(lerp(0.45, 0.9, top), 0.45, lerp(0.7, 0.4, top));
      },
    };
  },
};

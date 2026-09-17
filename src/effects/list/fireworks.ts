import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { ParticlePool } from '../particles';
import { Timeline, canvasTexture, fitDistance, pointScale, sampleTextPoints } from '../util';

type Pattern = 'peony' | 'ring' | 'willow' | 'heart' | 'palm' | 'strobe' | 'chrysanthemum';

interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
  color: THREE.Color;
  color2: THREE.Color;
  pattern: Pattern;
  power: number;
  textChunk?: Float32Array;
}

export const fireworks: EffectFactory = {
  id: 'fireworks',
  title: 'ネオン花火大会',
  description: '夜空いっぱいの花火が最後に残り日数を描き出す',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    const pool = new ParticlePool(Math.floor(42000 * quality), pointScale(ctx.renderer, camera));
    scene.add(pool.points);

    const textH = 6;
    const textCount = Math.floor(3200 * (0.5 + 0.5 * quality) * (0.7 + 0.3 * intensity));
    const text = sampleTextPoints(ctx.label, textCount, rng, textH, 0.4);
    const dist = fitDistance(camera, Math.max(text.width, 16), textH * 3.2, 0.82);
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    const vw = vh * camera.aspect;
    const groundY = -vh / 2;
    const textY = vh * 0.12;

    // night sky gradient and skyline silhouette
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(vw * 3, vh * 3),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(8, 256, (g, w, h) => {
          const grad = g.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#000004');
          grad.addColorStop(0.6, `#${palette.bg.clone().lerp(palette.colors[0], 0.12).getHexString()}`);
          grad.addColorStop(1, `#${palette.colors[0].clone().multiplyScalar(0.35).getHexString()}`);
          g.fillStyle = grad;
          g.fillRect(0, 0, w, h);
        }),
        depthWrite: false,
      }),
    );
    sky.position.z = -60;
    sky.scale.setScalar((dist + 60) / dist);
    scene.add(sky);

    const skyline = new THREE.Mesh(
      new THREE.PlaneGeometry(vw * 1.2, vh * 0.25),
      new THREE.MeshBasicMaterial({
        transparent: true,
        map: canvasTexture(1024, 256, (g, w, h) => {
          g.fillStyle = '#020205';
          let x = 0;
          while (x < w) {
            const bw = 20 + rng() * 60;
            const bh = h * (0.2 + rng() * 0.6);
            g.fillRect(x, h - bh, bw, bh);
            g.fillStyle = 'rgba(255,220,150,0.5)';
            for (let wy = h - bh + 8; wy < h - 6; wy += 12)
              for (let wx = x + 4; wx < x + bw - 6; wx += 10) if (rng() < 0.18) g.fillRect(wx, wy, 3, 5);
            g.fillStyle = '#020205';
            x += bw + rng() * 6;
          }
        }),
      }),
    );
    skyline.position.set(0, groundY + vh * 0.125, 1);
    scene.add(skyline);

    const shells: Shell[] = [];
    let idle = false;
    const tmp = new THREE.Color();
    const pickColor = () => palette.colors[rng.int(1, 3)].clone().lerp(new THREE.Color(1, 1, 1), rng() * 0.2);

    const launch = (x: number, apexY: number, pattern: Pattern, power = 1, textChunk?: Float32Array) => {
      const g = 9;
      const h = apexY - groundY;
      const vy = Math.sqrt(2 * g * h);
      shells.push({ x, y: groundY, vx: (rng() - 0.5) * 1.5, vy, fuse: vy / g, color: pickColor(), color2: pickColor(), pattern, power, textChunk });
      if (!idle) sfx.launch();
    };

    const burst = (s: Shell) => {
      const n = Math.floor((380 + 520 * intensity) * quality * s.power);
      const speed = (7 + rng() * 5) * s.power;
      post.flash(0.12 * s.power, s.color);
      if (!idle) {
        sfx.boom(0.35 * s.power);
        sfx.crackle(1.2, 0.3);
        ctx.haptic([0, 30]);
      }

      if (s.textChunk) {
        const chunk = s.textChunk;
        const m = chunk.length / 3;
        for (let i = 0; i < m; i++) {
          const u = rng() * 2 - 1;
          const th = rng() * Math.PI * 2;
          const r = Math.sqrt(1 - u * u) * speed * 1.4;
          tmp.copy(rng() < 0.35 ? palette.hot : s.color).multiplyScalar(0.55);
          const idx = pool.spawn(s.x, s.y, 0, Math.cos(th) * r, u * speed * 1.4, Math.sin(th) * r, tmp, 1.0 + rng() * 0.6, 999, 1.5, 0, rng() < 0.2 ? 4 : 0);
          pool.setTarget(idx, chunk[i * 3], chunk[i * 3 + 1] + textY, chunk[i * 3 + 2], 14 + rng() * 8);
        }
        return;
      }

      for (let i = 0; i < n; i++) {
        let vx = 0;
        let vy = 0;
        let vz = 0;
        const u = rng() * 2 - 1;
        const th = rng() * Math.PI * 2;
        const sq = Math.sqrt(1 - u * u);
        switch (s.pattern) {
          case 'ring': {
            const a = (i / n) * Math.PI * 2;
            vx = Math.cos(a) * speed;
            vy = Math.sin(a) * speed * 0.9;
            vz = Math.sin(a) * speed * 0.3;
            break;
          }
          case 'heart': {
            const a = (i / n) * Math.PI * 2;
            vx = (16 * Math.pow(Math.sin(a), 3)) * speed * 0.06;
            vy = (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * speed * 0.06;
            vz = (rng() - 0.5) * 0.5;
            break;
          }
          case 'palm': {
            const arm = Math.floor(rng() * 7);
            const a = (arm / 7) * Math.PI * 2;
            const sp = speed * (0.6 + rng() * 0.5);
            vx = Math.cos(a) * sp;
            vy = Math.abs(Math.sin(a)) * sp * 0.6 + sp * 0.35;
            vz = (rng() - 0.5);
            break;
          }
          default: {
            const sp = s.pattern === 'chrysanthemum' ? speed : speed * (0.85 + rng() * 0.15);
            vx = sq * Math.cos(th) * sp;
            vy = u * sp;
            vz = sq * Math.sin(th) * sp;
          }
        }
        const willow = s.pattern === 'willow';
        const color = willow ? new THREE.Color(1, 0.72, 0.3) : rng() < 0.5 ? s.color : s.color2;
        const flags = (s.pattern === 'strobe' ? 4 : 0) | (willow || s.pattern === 'palm' || s.pattern === 'chrysanthemum' ? 8 : 0);
        pool.spawn(s.x, s.y, 0, vx, vy, vz, color, willow ? 0.7 : 1.0, willow ? 3.2 + rng() : 1.6 + rng() * 0.9, willow ? 1.6 : 1.1, willow ? -2.2 : -3.2, flags);
      }
    };

    const patterns: Pattern[] = ['peony', 'ring', 'willow', 'heart', 'palm', 'strobe', 'chrysanthemum'];
    const tl = new Timeline();
    // opening barrage
    const opening = Math.floor(6 + 8 * intensity);
    for (let i = 0; i < opening; i++) {
      const at = 0.2 + (i / opening) * 4.4 + rng() * 0.3;
      tl.at(at, () => launch((rng() - 0.5) * vw * 0.8, rng() * vh * 0.35, rng.pick(patterns), 0.8 + rng() * 0.5));
    }
    // salvo of simultaneous chrysanthemums
    tl.at(3.6, () => {
      for (let k = -2; k <= 2; k++) launch((k * vw) / 6, vh * 0.25, 'chrysanthemum', 0.9);
    });
    // text shells: split the text point cloud into vertical slices, one shell each
    const slices = Math.max(3, Math.min(6, ctx.label.length + 2));
    const sorted = Array.from({ length: textCount }, (_, i) => i).sort((a, b) => text.positions[a * 3] - text.positions[b * 3]);
    for (let sidx = 0; sidx < slices; sidx++) {
      const from = Math.floor((sidx / slices) * textCount);
      const to = Math.floor(((sidx + 1) / slices) * textCount);
      const chunk = new Float32Array((to - from) * 3);
      let cx = 0;
      for (let j = from; j < to; j++) {
        const i = sorted[j];
        chunk.set(text.positions.subarray(i * 3, i * 3 + 3), (j - from) * 3);
        cx += text.positions[i * 3];
      }
      cx /= Math.max(1, to - from);
      tl.at(4.6 + sidx * 0.18, () => launch(cx, textY, 'peony', 1.2, chunk));
    }
    tl.at(6.9, () => {
      sfx.chord(0, 220);
      sfx.sparkle(30, 0.2, 2.5);
      post.shake(0.4 + intensity);
    });

    let idleTimer = 0;
    return {
      duration: 9.5,
      revealAt: 8.0,
      update(t, dt) {
        tl.run(t);
        for (let i = shells.length - 1; i >= 0; i--) {
          const s = shells[i];
          s.fuse -= dt;
          s.vy -= 9 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          pool.spawn(s.x + (rng() - 0.5) * 0.1, s.y, 0, (rng() - 0.5) * 0.5, -1 - rng(), 0, tmp.setRGB(1, 0.75, 0.45), 0.5, 0.5, 2, -1);
          if (s.fuse <= 0) {
            burst(s);
            shells.splice(i, 1);
          }
        }
        pool.update(dt, (i) => {
          const i3 = i * 3;
          tmp.setRGB(pool.col[i3] * 0.6, pool.col[i3 + 1] * 0.5, pool.col[i3 + 2] * 0.4);
          pool.spawn(pool.pos[i3], pool.pos[i3 + 1], pool.pos[i3 + 2], 0, -0.3, 0, tmp, 0.45, 0.7, 3, -0.5);
        });
        if (t > 9) {
          idle = true;
          idleTimer -= dt;
          if (idleTimer <= 0) {
            idleTimer = 1.4 + rng() * 1.6;
            const side = rng.sign();
            launch(side * vw * (0.25 + rng() * 0.2), vh * (0.2 + rng() * 0.15) + textY, rng.pick(patterns), 0.6);
          }
        }
        post.setBloom(0.9, 0.4, 0.15);
      },
      resize() {
        pool.setPointScale(pointScale(ctx.renderer, camera));
      },
    };
  },
};

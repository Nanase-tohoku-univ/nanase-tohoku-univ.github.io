import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EffectFactory } from '../types';
import { TEXT_LIFT, Timeline, canvasTexture, easeInCubic, fitDistance, lerp, sampleTextPoints, smooth } from '../util';

function gearGeometry(radius: number, teeth: number, depth: number, hole = 0.25): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const inner = radius * 0.86;
  const toothW = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * toothW;
    const pts: Array<[number, number]> = [
      [inner, a],
      [radius, a + toothW * 0.18],
      [radius, a + toothW * 0.48],
      [inner, a + toothW * 0.66],
    ];
    pts.forEach(([r, ang], k) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && k === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  const h = new THREE.Path();
  h.absarc(0, 0, radius * hole, 0, Math.PI * 2, true);
  shape.holes.push(h);
  // spokes as cut-outs
  if (radius > 1) {
    for (let s = 0; s < 5; s++) {
      const a0 = (s / 5) * Math.PI * 2 + 0.25;
      const a1 = a0 + (Math.PI * 2) / 5 - 0.5;
      const p = new THREE.Path();
      p.absarc(0, 0, radius * 0.7, a0, a1, false);
      p.absarc(0, 0, radius * 0.38, a1, a0, true);
      shape.holes.push(p);
    }
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.15, bevelSize: depth * 0.1, bevelSegments: 2, curveSegments: 12 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

export const clockwork: EffectFactory = {
  id: 'clockwork',
  title: '歯車時計の崩壊',
  description: '巨大な機械時計が暴走・分解し、無数の歯車が回転しながら数字を組み上げる',
  create(ctx) {
    const { scene, camera, renderer, rng, palette, intensity, quality, sfx, post } = ctx;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.background = new THREE.Color(0x07050a);
    const textH = 7;
    const lift = -textH * TEXT_LIFT;

    const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a227'), metalness: 1, roughness: 0.28 });
    const copper = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b87333'), metalness: 1, roughness: 0.35 });
    const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b8c0cc'), metalness: 1, roughness: 0.2 });
    const mats = [brass, copper, steel];
    scene.add(new THREE.AmbientLight(0xffffff, 0.15));
    const key = new THREE.PointLight(palette.colors[2], 300, 80);
    key.position.set(8, 10, 18);
    scene.add(key);
    const rim = new THREE.PointLight(palette.colors[0], 200, 80);
    rim.position.set(-12, -6, 10);
    scene.add(rim);

    // clock mechanism: chain of meshing gears
    const mech = new THREE.Group();
    scene.add(mech);
    type G = { mesh: THREE.Mesh; speed: number; v: THREE.Vector3; spin: THREE.Vector3 };
    const gears: G[] = [];
    let x = -7;
    let y = 2;
    let dir = 1;
    let prevR = 0;
    let prevSpeed = 0.6;
    for (let i = 0; i < 9; i++) {
      const r = rng.range(1.2, 3.2);
      const teeth = Math.round(r * 9);
      const mesh = new THREE.Mesh(gearGeometry(r, teeth, 0.5), mats[i % 3]);
      if (i > 0) {
        const ang = rng.range(-0.9, 0.9);
        x += Math.cos(ang) * (prevR + r) * 0.93;
        y += Math.sin(ang) * (prevR + r) * 0.93;
        if (x > 8) {
          x -= 14;
          y -= 5;
        }
      }
      mesh.position.set(x, y, -i * 0.05 - 1);
      const speed = i === 0 ? prevSpeed : (-prevSpeed * prevR) / r;
      gears.push({ mesh, speed, v: new THREE.Vector3(), spin: new THREE.Vector3() });
      mech.add(mesh);
      prevR = r;
      prevSpeed = speed;
      dir *= -1;
    }

    // clock face with hands
    const faceTex = canvasTexture(512, 512, (g, w, h) => {
      g.translate(w / 2, h / 2);
      g.fillStyle = 'rgba(12,10,16,0.85)';
      g.beginPath();
      g.arc(0, 0, 250, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c9a227';
      g.lineWidth = 8;
      g.stroke();
      g.fillStyle = '#e8d9a8';
      g.font = 'bold 44px "Times New Roman", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        g.fillText(n, Math.cos(a) * 200, Math.sin(a) * 200);
      });
    });
    const face = new THREE.Mesh(new THREE.CircleGeometry(5, 64), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true }));
    face.position.set(0, 1, 0.6);
    scene.add(face);
    const handMat = new THREE.MeshStandardMaterial({ color: '#e8d9a8', metalness: 0.8, roughness: 0.3, emissive: palette.colors[2], emissiveIntensity: 0.3 });
    const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.1).translate(0, 1.3, 0), handMat);
    const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.8, 0.1).translate(0, 1.9, 0), handMat);
    hourHand.position.set(0, 1, 0.8);
    minHand.position.set(0, 1, 0.9);
    scene.add(hourHand, minHand);

    // small gears that build the number
    const n = Math.floor(900 * (0.5 + 0.5 * quality) * (0.7 + 0.3 * intensity));
    const text = sampleTextPoints(ctx.label, n, rng, textH, 0.6);
    const dist = fitDistance(camera, text.width, textH, 0.8);
    const smallGeo = gearGeometry(0.22, 10, 0.08, 0.3);
    const small = new THREE.InstancedMesh(smallGeo, brass, n);
    small.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    small.frustumCulled = false;
    const tints = [new THREE.Color('#ffd166'), new THREE.Color('#e0a060'), new THREE.Color('#dfe6f0'), palette.colors[2].clone().lerp(new THREE.Color('#ffd166'), 0.5)];
    for (let i = 0; i < n; i++) small.setColorAt(i, rng.pick(tints));
    scene.add(small);
    const st = Array.from({ length: n }, () => ({
      from: new THREE.Vector3((rng() - 0.5) * 60, (rng() - 0.5) * 60, -20 - rng() * 30),
      spin: rng.range(2, 8) * rng.sign(),
      tilt: rng.range(-0.3, 0.3),
      delay: rng() * 0.8,
      s: rng.range(0.8, 1.4),
    }));

    const tBreak = 3.6;
    const tForm = 4.6;
    const tl = new Timeline();
    // accelerating tick-tock
    let tt = 0.15;
    let gap = 0.5;
    while (tt < tBreak) {
      const at = tt;
      const k = Math.round(tt / 0.05);
      tl.at(at, () => sfx.tick(0, k % 2 ? 1400 : 1000));
      tt += gap;
      gap = Math.max(0.06, gap * 0.86);
    }
    tl.at(tBreak - 1.4, () => sfx.riser(1.4))
      .at(tBreak, () => {
        sfx.boom(1.3);
        sfx.crackle(1.5);
        sfx.glitch(0.3);
        post.flash(0.7, 0xffe0a0);
        post.shake(2.5 + intensity * 2);
        ctx.haptic([0, 200, 40, 100]);
        for (const g of gears) {
          const out = g.mesh.position.clone().setZ(0).normalize();
          g.v.set(out.x * rng.range(10, 25), out.y * rng.range(10, 25) + 5, rng.range(5, 25));
          g.spin.set(rng.range(-4, 4), rng.range(-4, 4), rng.range(-8, 8));
        }
      })
      .at(tForm + 1.2, () => {
        sfx.chord(0, 185, 3);
        sfx.sparkle(24, 0, 1.4);
      });

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    return {
      duration: tForm + 2.8,
      revealAt: tForm + 1.7,
      update(t, dt) {
        tl.run(t);
        const rush = easeInCubic(smooth(0, tBreak, t));
        const spinRate = 1 + rush * 25;
        for (const g of gears) {
          if (t < tBreak) {
            g.mesh.rotation.z += g.speed * spinRate * dt;
            g.mesh.position.x += (Math.random() - 0.5) * rush * 0.04;
          } else {
            g.v.y -= 15 * dt;
            g.mesh.position.addScaledVector(g.v, dt);
            g.mesh.rotation.x += g.spin.x * dt;
            g.mesh.rotation.y += g.spin.y * dt;
            g.mesh.rotation.z += g.spin.z * dt;
          }
        }
        minHand.rotation.z = -t * (1 + rush * 40) * 2;
        hourHand.rotation.z = -t * (1 + rush * 40) * 2 / 12;
        const faceOn = t < tBreak;
        face.visible = hourHand.visible = minHand.visible = faceOn;

        for (let i = 0; i < n; i++) {
          const s = st[i];
          const k = t < tForm - 0.6 ? 0 : 1 - Math.pow(1 - smooth(tForm - 0.6 + s.delay * 0.7, tForm + 1.2 + s.delay * 0.4, t), 3);
          tgt.set(text.positions[i * 3], text.positions[i * 3 + 1], text.positions[i * 3 + 2]);
          p.lerpVectors(s.from, tgt, k);
          p.z += Math.sin(k * Math.PI) * 6;
          e.set(s.tilt * (1 - k) + Math.sin(t + i) * 0.1 * k, s.tilt * (1 - k), t * s.spin * lerp(3, 0.4, k));
          q.setFromEuler(e);
          sc.setScalar(k <= 0 ? 0.0001 : s.s);
          m4.compose(p, q, sc);
          small.setMatrixAt(i, m4);
        }
        small.instanceMatrix.needsUpdate = true;

        const settle = smooth(tForm, tForm + 1.8, t);
        const shakeCam = t < tBreak ? rush * 0.15 : 0;
        camera.position.set(Math.sin(t * 0.3) * 2 * (1 - settle) + (Math.random() - 0.5) * shakeCam, lerp(1, lift, settle), lerp(22, dist, settle));
        camera.lookAt(0, lerp(1, lift, settle), 0);
        key.position.x = Math.sin(t * 0.8) * 12;
        post.setBloom(0.55, 0.4, 0.75);
      },
      dispose() {
        envRT.dispose();
        pmrem.dispose();
      },
    };
  },
};

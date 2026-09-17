import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { TEXT_LIFT, Timeline, easeOutBack, fitDistance, lerp, smooth, textGeometry, textMask } from '../util';

const BOOT = [
  '$ ssh m2@lab-server.example',
  'Authenticating with public key "thesis_ed25519"... OK',
  'Welcome to GRADUATION OS 2027 LTS',
  '$ sudo ./countdown --target 2027-03-25 --verbose',
  '[ 0.000] Loading kernel module: master_thesis.ko',
  '[ 0.013] Mounting /dev/brain on /research ... ok',
  '[ 0.021] Coffee level: 12% (WARN)',
  '[ 0.034] Decrypting chapters.enc',
  '[ 0.048] Resolving 214 citations ........ done',
  '[ 0.062] Checking figure DPI ............ done',
  '[ 0.077] Querying advisor approval ...... pending',
  '[ 0.091] Synchronizing with calendar daemon',
];

export const hacker: EffectFactory = {
  id: 'hacker',
  title: 'ハッキング端末',
  description: 'CRT端末が暴走、警報の末に画面が割れて3Dネオン数字が飛び出す',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, sfx, post } = ctx;
    scene.background = new THREE.Color(0x000000);
    const green = palette.colors[1].clone().lerp(new THREE.Color(0x33ff66), 0.35);
    const greenCss = `#${green.getHexString()}`;

    // ---------- terminal canvas ----------
    const screenDist = 10;
    camera.position.set(0, 0, screenDist);
    camera.lookAt(0, 0, 0);
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * screenDist;
    const vw = vh * camera.aspect;
    const cw = 900;
    const ch = Math.round(cw * (vh / vw));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const g = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const cols = 40;
    const mask = textMask(ctx.label, cols);
    const lines: string[] = [];
    let bootIdx = 0;
    let hexTimer = 0;

    const draw = (t: number) => {
      const alarm = t > 2.6 && t < 4.3;
      g.fillStyle = alarm && Math.floor(t * 8) % 2 === 0 ? '#2a0000' : '#010401';
      g.fillRect(0, 0, cw, ch);
      const fs = 22;
      g.font = `${fs}px "Consolas", "Menlo", monospace`;
      g.textBaseline = 'top';

      if (t < 4.3) {
        g.fillStyle = alarm ? '#ff3b3b' : greenCss;
        const maxLines = Math.floor((ch - 40) / (fs + 6));
        const shown = lines.slice(-maxLines);
        shown.forEach((l, i) => g.fillText(l, 20, 20 + i * (fs + 6)));
        if (Math.floor(t * 3) % 2 === 0) g.fillRect(20 + g.measureText(shown[shown.length - 1] ?? '').width + 4, 20 + (shown.length - 1) * (fs + 6), 12, fs);
      }
      if (alarm) {
        g.save();
        g.fillStyle = '#ff2020';
        g.font = `900 ${Math.round(cw * 0.085)}px "Arial Black", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const y = ch * 0.45;
        g.fillRect(0, y - cw * 0.09, cw, cw * 0.18);
        g.fillStyle = '#000';
        g.fillText('⚠ DEADLINE ALERT ⚠', cw / 2 + (rng() - 0.5) * 12, y);
        g.restore();
      }
      if (t >= 4.3) {
        // ASCII art number
        const cell = (cw * 0.92) / cols;
        const rowsShown = Math.floor(smooth(4.3, 5.2, t) * mask.rows + 0.999);
        const top = ch * 0.5 - (mask.rows * cell * 1.2) / 2 - ch * 0.12;
        g.font = `bold ${Math.round(cell * 1.15)}px "Consolas", monospace`;
        for (let r = 0; r < rowsShown; r++) {
          for (let c = 0; c < cols; c++) {
            const on = mask.mask[r][c];
            g.fillStyle = on ? `#${palette.hot.getHexString()}` : 'rgba(80,255,120,0.12)';
            const chs = on ? '#@$%&8' : '.:01';
            g.fillText(chs[Math.floor(rng() * chs.length)], cw * 0.04 + c * cell, top + r * cell * 1.2);
          }
        }
        g.fillStyle = greenCss;
        g.font = `${fs}px "Consolas", monospace`;
        g.fillText(`> DAYS_REMAINING = ${ctx.label};`, 20, ch - 60);
      }
      // scanline bands baked in
      tex.needsUpdate = true;
    };

    const crtMat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: tex }, uT: { value: 0 }, uGlitch: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; uniform float uT, uGlitch; varying vec2 vUv;
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          vec2 uv = vUv * 2.0 - 1.0;
          uv *= 1.0 + dot(uv, uv) * 0.06;
          uv = uv * 0.5 + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
          float row = floor(uv.y * 40.0);
          float gl = step(1.0 - uGlitch * 0.5, hash(row + floor(uT * 20.0)));
          uv.x += gl * (hash(row * 3.1 + uT) - 0.5) * 0.2 * uGlitch;
          float shift = 0.002 + uGlitch * 0.01;
          vec3 col = vec3(texture2D(tMap, uv + vec2(shift, 0.0)).r, texture2D(tMap, uv).g, texture2D(tMap, uv - vec2(shift, 0.0)).b);
          col *= 0.8 + 0.2 * sin(uv.y * 900.0);
          col *= 0.9 + 0.1 * sin(uv.y * 6.0 - uT * 4.0);
          vec2 v = vUv - 0.5;
          col *= 1.0 - dot(v, v) * 1.2;
          gl_FragColor = vec4(col * 1.25, 1.0);
        }`,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), crtMat);
    scene.add(screen);

    // ---------- shards ----------
    const shardGroup = new THREE.Group();
    shardGroup.visible = false;
    scene.add(shardGroup);
    const gx = 7;
    const gy = Math.round(gx * (vh / vw));
    const pts: THREE.Vector2[][] = [];
    for (let y = 0; y <= gy; y++) {
      pts.push([]);
      for (let x = 0; x <= gx; x++) {
        const edgeX = x === 0 || x === gx;
        const edgeY = y === 0 || y === gy;
        pts[y].push(new THREE.Vector2(x / gx + (edgeX ? 0 : (rng() - 0.5) * 0.08), y / gy + (edgeY ? 0 : (rng() - 0.5) * 0.08)));
      }
    }
    const shardMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true });
    const shards: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3 }> = [];
    for (let y = 0; y < gy; y++)
      for (let x = 0; x < gx; x++) {
        const quads = [
          [pts[y][x], pts[y][x + 1], pts[y + 1][x]],
          [pts[y][x + 1], pts[y + 1][x + 1], pts[y + 1][x]],
        ];
        for (const tri of quads) {
          const c = tri.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(3);
          const pos: number[] = [];
          const uv: number[] = [];
          for (const p of tri) {
            pos.push((p.x - c.x) * vw, (p.y - c.y) * vh, 0);
            uv.push(p.x, p.y);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          const mesh = new THREE.Mesh(geo, shardMat);
          mesh.position.set((c.x - 0.5) * vw, (c.y - 0.5) * vh, 0);
          shardGroup.add(mesh);
          const out = mesh.position.clone().setZ(0).normalize();
          shards.push({
            mesh,
            vel: new THREE.Vector3(out.x * (4 + rng() * 10), out.y * (4 + rng() * 10), 6 + rng() * 14),
            spin: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(10),
          });
        }
      }

    // ---------- neon world behind ----------
    const world = new THREE.Group();
    world.visible = false;
    scene.add(world);
    const textSize = 5;
    const tgeo = textGeometry(ctx.label, textSize, 1.8);
    tgeo.computeBoundingBox();
    const tw = tgeo.boundingBox!.max.x - tgeo.boundingBox!.min.x;
    const textMesh = new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ color: 0x050505, emissive: palette.colors[0], emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(tgeo, 25), new THREE.LineBasicMaterial({ color: palette.hot }));
    textMesh.add(edges);
    const textRoot = new THREE.Group();
    textRoot.add(textMesh);
    world.add(textRoot);
    world.add(new THREE.AmbientLight(0xffffff, 0.3));
    const pl = new THREE.PointLight(palette.colors[2], 60, 60);
    pl.position.set(0, 4, 8);
    world.add(pl);

    const floorMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uC: { value: palette.colors[1].clone().multiplyScalar(0.9) }, uC2: { value: palette.colors[0] } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uT; uniform vec3 uC, uC2; varying vec2 vUv;
        void main(){
          vec2 p = vUv * vec2(40.0, 80.0);
          p.y += uT * 6.0;
          vec2 grid = abs(fract(p) - 0.5) / fwidth(p);
          float line = 1.0 - min(min(grid.x, grid.y), 1.0);
          float fade = smoothstep(1.0, 0.3, vUv.y);
          gl_FragColor = vec4(mix(uC2 * 0.15, uC * 1.6, line) * fade, 1.0);
        }`,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -textSize * 0.9;
    world.add(floor);

    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.ShaderMaterial({
        uniforms: { uA: { value: palette.colors[2].clone().multiplyScalar(0.85) }, uB: { value: palette.colors[0].clone().multiplyScalar(0.8) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uA, uB; varying vec2 vUv;
          void main(){
            float stripes = step(0.35, fract(vUv.y * 14.0)) + step(0.6, vUv.y);
            if (stripes < 0.5) discard;
            gl_FragColor = vec4(mix(uB, uA, vUv.y) * 1.2, 1.0);
          }`,
      }),
    );
    sun.position.set(0, 8, -90);
    world.add(sun);

    const finalDist = fitDistance(camera, tw, textSize, 0.78);
    const tShatter = 5.8;
    const tl = new Timeline();
    BOOT.forEach((_, i) => tl.at(0.1 + i * 0.2, () => {
      lines.push(BOOT[bootIdx++]);
      sfx.tick(0, 1200 + rng() * 800);
    }));
    tl.at(2.6, () => {
      sfx.glitch(0.4);
      post.shake(0.3);
      ctx.haptic([0, 100, 60, 100, 60, 100]);
    });
    for (let i = 0; i < 6; i++) tl.at(2.7 + i * 0.28, () => sfx.tick(0, i % 2 ? 880 : 660));
    tl.at(4.3, () => sfx.riser(1.5));
    tl.at(tShatter, () => {
      screen.visible = false;
      shardGroup.visible = true;
      world.visible = true;
      scene.background = palette.bg.clone();
      sfx.boom(1.1);
      sfx.crackle(0.8);
      post.flash(0.8, 0xffffff);
      post.shake(1.5 + intensity * 2);
      ctx.haptic([0, 150]);
    });
    tl.at(tShatter + 0.9, () => {
      sfx.chord(0, 174.61);
      sfx.sparkle(16, 0, 1);
    });

    return {
      duration: tShatter + 2.8,
      revealAt: tShatter + 1.4,
      update(t, dt) {
        tl.run(t);
        if (t < tShatter) {
          hexTimer -= dt;
          if (t > 1.8 && t < 2.6 && hexTimer <= 0) {
            hexTimer = 0.04;
            lines.push(Array.from({ length: 8 }, () => Math.floor(rng() * 0xffff).toString(16).padStart(4, '0')).join(' '));
          }
          draw(t);
          crtMat.uniforms.uT.value = t;
          crtMat.uniforms.uGlitch.value = t > 2.6 && t < 4.3 ? 0.6 + Math.sin(t * 30) * 0.4 : t > 5.2 ? smooth(5.2, tShatter, t) : 0.05;
          post.setAberration(t > 2.6 && t < 4.3 ? 2 : 0.4);
          post.setBloom(0.7, 0.4, 0.2);
        } else {
          const te = t - tShatter;
          for (const s of shards) {
            s.mesh.position.addScaledVector(s.vel, dt);
            s.mesh.rotation.x += s.spin.x * dt;
            s.mesh.rotation.y += s.spin.y * dt;
            s.mesh.rotation.z += s.spin.z * dt;
          }
          shardMat.opacity = 1 - smooth(0.3, 1.2, te);
          const e = easeOutBack(smooth(0, 1.4, te));
          textRoot.scale.setScalar(lerp(0.2, 1, e));
          textRoot.position.z = lerp(-40, 0, e);
          textMesh.rotation.y = Math.sin(t * 0.8) * 0.35 + (1 - e) * Math.PI * 2;
          textMesh.rotation.x = Math.sin(t * 0.6) * 0.08;
          floorMat.uniforms.uT.value = t;
          const lift = -textSize * TEXT_LIFT;
          camera.position.set(0, lift + 0.5, lerp(screenDist, finalDist, smooth(0, 1.4, te)));
          camera.lookAt(0, lift, 0);
          post.setBloom(0.7, 0.4, 0.35);
          post.setAberration(lerp(2.5, 0.4, smooth(0, 1, te)));
        }
      },
    };
  },
};

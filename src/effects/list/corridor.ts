import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { TEXT_LIFT, Timeline, canvasTexture, easeInOutCubic, easeOutBack, fitDistance, glowTexture, lerp, smooth } from '../util';

const GRID = 16;
const CELL = 128;

function drawPage(g: CanvasRenderingContext2D, x: number, y: number, size: number, days: number, label: string, hot: string): void {
  const pad = size * 0.06;
  g.fillStyle = '#fffaf0';
  g.fillRect(x + pad, y + pad, size - pad * 2, size - pad * 2);
  g.fillStyle = hot;
  g.fillRect(x + pad, y + pad, size - pad * 2, size * 0.18);
  g.fillStyle = '#fff';
  g.font = `bold ${size * 0.1}px "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, x + size / 2, y + pad + size * 0.09);
  g.fillStyle = '#111';
  g.font = `900 ${size * 0.46}px "Arial Black", sans-serif`;
  g.fillText(String(days), x + size / 2, y + size * 0.6);
}

export const corridor: EffectFactory = {
  id: 'corridor',
  title: '無限日めくり回廊',
  description: 'これまでめくってきた全ページの回廊を超高速で駆け抜け、今日のページに辿り着く',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, sfx, post } = ctx;
    scene.background = palette.bg.clone();
    scene.fog = new THREE.Fog(palette.bg, 20, 110);

    const total = Math.max(ctx.totalDays, ctx.days + 1);
    const count = Math.min(GRID * GRID, total + 1);
    const todayK = Math.min(count - 1, total - ctx.days);
    const hotCss = `#${palette.colors[1].getHexString()}`;
    const atlas = canvasTexture(GRID * CELL, GRID * CELL, (g) => {
      for (let k = 0; k < count; k++) drawPage(g, (k % GRID) * CELL, Math.floor(k / GRID) * CELL, CELL, total - k, `DAY ${k + 1}`, hotCss);
    });

    const spacing = 2.4;
    const R = 4.2;
    const geo = new THREE.PlaneGeometry(2.2, 2.2);
    const cells = new Float32Array(count);
    const states = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      cells[k] = k;
      states[k] = k < todayK ? 0 : k === todayK ? 1 : 2;
    }
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
    geo.setAttribute('aState', new THREE.InstancedBufferAttribute(states, 1));
    const uniforms = {
      tAtlas: { value: atlas },
      uGold: { value: new THREE.Color('#ffd166') },
      uGhost: { value: palette.colors[0] },
      fogColor: { value: palette.bg },
      fogNear: { value: 20 },
      fogFar: { value: 110 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.DoubleSide,
      transparent: true,
      fog: true,
      vertexShader: /* glsl */ `
        attribute float aCell; attribute float aState;
        varying vec2 vUv; varying float vState; varying float vDepth;
        void main(){
          float cx = mod(aCell, ${GRID}.0);
          float cy = floor(aCell / ${GRID}.0);
          vUv = (vec2(cx, ${GRID}.0 - 1.0 - cy) + uv) / ${GRID}.0;
          vState = aState;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAtlas; uniform vec3 uGold, uGhost, fogColor; uniform float fogNear, fogFar;
        varying vec2 vUv; varying float vState; varying float vDepth;
        void main(){
          vec4 c = texture2D(tAtlas, vUv);
          if (c.a < 0.1) discard;
          vec3 col = c.rgb;
          if (vState < 0.5) col = mix(col, col * uGold * 1.3, 0.45);
          else if (vState > 1.5) col = mix(uGhost * 0.25, col, 0.25);
          float f = smoothstep(fogNear, fogFar, vDepth);
          gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
        }`,
    });
    const pages = new THREE.InstancedMesh(geo, mat, count);
    pages.frustumCulled = false;
    const base: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    const todayZ = -todayK * spacing;
    for (let k = 0; k < count; k++) {
      const a = k * 0.42;
      pos.set(Math.cos(a) * R, Math.sin(a) * R, -k * spacing);
      q.setFromEuler(new THREE.Euler(0, 0, a + Math.PI / 2 + (rng() - 0.5) * 0.3));
      m4.compose(pos, q, sc);
      base.push(m4.clone());
      pages.setMatrixAt(k, m4);
    }
    scene.add(pages);

    // today's page, high resolution
    const pageSize = 6;
    const todayTex = canvasTexture(512, 512, (g) => drawPage(g, 0, 0, 512, ctx.days, 'TODAY', `#${palette.colors[2].getHexString()}`));
    const today = new THREE.Mesh(new THREE.PlaneGeometry(pageSize, pageSize), new THREE.MeshBasicMaterial({ map: todayTex, color: new THREE.Color(0.72, 0.72, 0.72), side: THREE.DoubleSide, fog: false }));
    const todayBack = new THREE.Mesh(
      new THREE.PlaneGeometry(pageSize, pageSize),
      new THREE.MeshBasicMaterial({ map: canvasTexture(256, 256, (g, w, h) => {
        g.fillStyle = `#${palette.colors[0].getHexString()}`;
        g.fillRect(8, 8, w - 16, h - 16);
        g.fillStyle = '#fff';
        g.font = '900 150px "Arial Black", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('?', w / 2, h / 2 + 8);
      }), fog: false }),
    );
    todayBack.rotation.y = Math.PI;
    const todayGroup = new THREE.Group();
    todayGroup.add(today, todayBack);
    todayGroup.position.set(0, 0, todayZ - 8);
    scene.add(todayGroup);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(128, 0.3), color: palette.colors[2], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.setScalar(pageSize * 2.6);
    halo.position.z = -0.6;
    todayGroup.add(halo);

    const lift = -pageSize * TEXT_LIFT * 0.6;
    const endDist = fitDistance(camera, pageSize, pageSize, 0.75);
    const startZ = 30;
    const endZ = todayZ - 8 + endDist;
    const tArrive = 4.6;
    const tFlip = tArrive + 0.3;
    const tl = new Timeline()
      .at(0.1, () => sfx.riser(tArrive - 0.1))
      .at(tArrive - 0.1, () => {
        sfx.whoosh(0.5);
        post.shake(0.5);
      })
      .at(tFlip + 0.35, () => {
        sfx.boom(1.1);
        sfx.chord(0.05, 207.65, 3);
        sfx.sparkle(24, 0.1, 1.5);
        post.flash(0.6, palette.colors[2]);
        post.shake(1 + intensity);
        ctx.haptic([0, 120, 40, 120]);
      });
    const pass = Math.min(60, todayK);
    for (let i = 0; i < pass; i++) tl.at(0.8 + (i / pass) * (tArrive - 1.2), () => sfx.tick(0, 2500 + rng() * 1500));

    return {
      duration: tFlip + 2.6,
      revealAt: tFlip + 1.0,
      update(t) {
        tl.run(t);
        const k = easeInOutCubic(smooth(0, tArrive, t));
        const camZ = lerp(startZ, endZ, k);
        const speed = Math.sin(Math.min(1, t / tArrive) * Math.PI);
        post.setWarp(speed * 1.3);
        camera.fov = 50 + speed * 30;
        camera.updateProjectionMatrix();
        camera.position.set(Math.sin(t * 1.3) * 0.6 * speed, lift + Math.cos(t) * 0.4 * speed, camZ);
        camera.lookAt(0, lift, camZ - 10);
        camera.rotateZ(t * 0.6 * speed);

        // pages twist around the corridor as the camera passes them
        for (let i = 0; i < count; i++) {
          const z = -i * spacing;
          const near = smooth(8, 0, Math.abs(z - camZ));
          m4.copy(base[i]);
          if (near > 0) {
            m4.multiply(new THREE.Matrix4().makeRotationX(near * Math.PI * 0.9));
          }
          pages.setMatrixAt(i, m4);
        }
        pages.instanceMatrix.needsUpdate = true;

        const flip = easeOutBack(smooth(tFlip, tFlip + 0.7, t));
        todayGroup.rotation.y = Math.PI * (1 - flip);
        todayGroup.scale.setScalar(lerp(0.6, 1, smooth(tArrive - 1, tArrive, t)));
        halo.material.opacity = smooth(tFlip + 0.3, tFlip + 1, t) * (0.5 + 0.15 * Math.sin(t * 4));
        post.setBloom(0.5 + speed * 0.4, 0.4, 0.8);
      },
    };
  },
};

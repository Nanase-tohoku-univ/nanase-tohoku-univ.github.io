import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { TEXT_LIFT, Timeline, easeInCubic, fitDistance, lerp, sampleTextPoints, smooth } from '../util';

function petalGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.45, -0.3, 0.5, 0.25, 0.18, 0.5);
  s.lineTo(0, 0.38);
  s.lineTo(-0.18, 0.5);
  s.bezierCurveTo(-0.5, 0.25, -0.45, -0.3, 0, -0.5);
  const geo = new THREE.ShapeGeometry(s, 6);
  // gentle cup so lighting-free shading still reads as 3D via vertex color
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, (x * x) * 0.6);
    const k = 0.75 + 0.25 * (1 - Math.hypot(x, y + 0.5));
    col.set([k, k * 0.95, k], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export const sakuraHole: EffectFactory = {
  id: 'sakura-hole',
  title: '桜ブラックホール',
  description: '花びらが重力レンズに歪みながら吸い込まれ、ホワイトホールから数字として噴き出す',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    scene.background = new THREE.Color(0x000000);
    const textH = 6;
    const lift = -textH * TEXT_LIFT;

    // lensing backdrop (screen-aligned quad at the far plane)
    const bgUniforms = {
      uT: { value: 0 },
      uMass: { value: 0.0 },
      uDisk: { value: 1.0 },
      uWhite: { value: 0.0 },
      uAspect: { value: ctx.width / ctx.height },
      uC0: { value: palette.colors[0] },
      uC2: { value: palette.colors[2] },
      uHot: { value: palette.hot },
    };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: bgUniforms,
        depthWrite: false,
        depthTest: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uT, uMass, uDisk, uWhite, uAspect;
          uniform vec3 uC0, uC2, uHot;
          varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          vec3 stars(vec2 uv){
            vec3 c = vec3(0.0);
            for (int l = 0; l < 3; l++){
              float s = 60.0 + float(l) * 90.0;
              vec2 g = floor(uv * s);
              vec2 f = fract(uv * s) - 0.5;
              float h = hash(g + float(l) * 13.0);
              if (h > 0.985) {
                float d = length(f - (vec2(hash(g + 1.0), hash(g + 2.0)) - 0.5) * 0.6);
                c += vec3(0.8, 0.85, 1.0) * smoothstep(0.08, 0.0, d) * (h - 0.985) * 60.0;
              }
            }
            float neb = sin(uv.x * 3.0 + sin(uv.y * 4.0)) * sin(uv.y * 2.0 + uT * 0.05);
            c += uC0 * 0.08 * (neb * 0.5 + 0.5);
            return c;
          }
          void main(){
            vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
            p.y -= 0.12;
            float r = length(p);
            float rs = 0.06 * uMass;
            vec2 dir = normalize(p + 1e-5);
            // light bending: pull sample position toward the hole
            vec2 q = p - dir * rs * rs / max(r, 1e-3) * 2.2;
            vec3 col = stars(q + vec2(uT * 0.004, 0.0));
            // accretion disk: tilted ellipse with swirling noise
            vec2 dp = vec2(p.x, p.y * 3.2);
            float dr = length(dp);
            float ang = atan(dp.y, dp.x);
            float swirl = sin(ang * 6.0 - uT * 5.0 + dr * 40.0) * 0.5 + 0.5;
            float disk = smoothstep(rs * 1.3, rs * 1.9, dr) * smoothstep(rs * 4.2, rs * 2.0, dr) * uDisk;
            vec3 diskCol = mix(uC0, mix(uC2, uHot, 0.4), swirl) * (0.35 + 0.65 * swirl * swirl);
            // doppler: brighter on approaching side
            diskCol *= 0.6 + 0.8 * smoothstep(-1.0, 1.0, -dp.x / max(dr, 1e-3));
            col += diskCol * disk;
            // photon ring and event horizon
            col += uC2 * exp(-pow((r - rs * 1.05) / (rs * 0.06 + 1e-4), 2.0)) * 0.9 * step(0.001, uMass);
            col *= smoothstep(rs * 0.95, rs * 1.02, r) + step(uMass, 0.001);
            // white hole burst
            col += uHot * uWhite * (0.05 / (r * r * 60.0 + 0.05));
            col = col / (1.0 + col * 0.8);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    bg.frustumCulled = false;
    bg.renderOrder = -10;
    scene.add(bg);

    // petals
    const n = Math.floor(2600 * (0.4 + 0.6 * quality) * (0.7 + 0.3 * intensity));
    const text = sampleTextPoints(ctx.label, n, rng, textH, 0.6);
    const dist = fitDistance(camera, text.width, textH, 0.8);
    camera.position.set(0, lift, dist);
    camera.lookAt(0, lift, 0);
    // hole sits where the shader draws it: 0.12 of view height above center
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    const hole = new THREE.Vector3(0, lift + vh * 0.12, 0);

    const petals = new THREE.InstancedMesh(petalGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true }), n);
    petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    petals.frustumCulled = false;
    const cols = [palette.colors[0], palette.colors[1], palette.colors[2], new THREE.Color('#ffc0d8'), new THREE.Color('#ffe3ee')];
    const st = Array.from({ length: n }, (_, i) => {
      const c = rng.pick(cols).clone().lerp(new THREE.Color('#ff9ec7'), 0.35);
      petals.setColorAt(i, c);
      return {
        r: vh * (0.35 + rng() * 0.9),
        a: rng() * Math.PI * 2,
        y: (rng() - 0.5) * 4,
        w: rng.range(0.3, 0.8),
        spin: new THREE.Vector3(rng(), rng(), rng()).multiplyScalar(4),
        size: rng.range(0.22, 0.42),
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        delay: rng() * 0.8,
      };
    });
    scene.add(petals);

    const tCollapse = 4.2;
    const tWhite = 4.6;
    const tl = new Timeline()
      .at(0.1, () => sfx.drone(tCollapse, 0, 36.7))
      .at(1.0, () => sfx.riser(tCollapse - 1))
      .at(tCollapse, () => {
        sfx.whoosh(0.4);
        ctx.haptic([0, 40]);
      })
      .at(tWhite, () => {
        sfx.boom(1.3);
        sfx.sparkle(30, 0.2, 2);
        post.flash(1, palette.hot);
        post.shake(2 + intensity * 2);
        ctx.haptic([0, 200]);
      })
      .at(tWhite + 2.2, () => sfx.chord(0, 261.63, 3));

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    let ejected = false;
    return {
      duration: tWhite + 3.8,
      revealAt: tWhite + 2.6,
      update(t, dt) {
        tl.run(t);
        bgUniforms.uT.value = t;
        bgUniforms.uMass.value = t < tCollapse ? lerp(0.6, 2.2, smooth(0, tCollapse, t)) : Math.max(0, 2.2 * (1 - (t - tCollapse) / (tWhite - tCollapse)));
        bgUniforms.uDisk.value = t < tWhite ? 1 : Math.max(0, 1 - (t - tWhite));
        bgUniforms.uWhite.value = t < tWhite ? 0 : Math.exp(-(t - tWhite) * 3) * 1.5;
        post.setAberration(t < tWhite ? smooth(2, tCollapse, t) * 3 : lerp(3, 0.3, smooth(tWhite, tWhite + 1, t)));
        post.setBloom(0.8, 0.45, 0.25);

        for (let i = 0; i < n; i++) {
          const p = st[i];
          if (t < tWhite) {
            // spiral in
            const pull = easeInCubic(smooth(p.delay, tCollapse, t));
            const r = p.r * (1 - pull) + 0.01;
            p.a += dt * p.w * (1 + 6 / (r + 0.4));
            p.p.set(hole.x + Math.cos(p.a) * r, hole.y + Math.sin(p.a) * r * 0.35 + p.y * (1 - pull) * 0.5, Math.sin(p.a) * r * 0.5);
            e.set(p.spin.x * t, p.spin.y * t, p.spin.z * t + p.a);
            const stretch = 1 + pull * 2.5;
            s.set(p.size / stretch, p.size * stretch, p.size).multiplyScalar(1 - pull * 0.8);
            if (t >= tCollapse) s.multiplyScalar(0.001);
            p.v.set(0, 0, 0);
          } else {
            // eject, then spring into the text
            const te = t - tWhite;
            if (!ejected) {
              const a = rng() * Math.PI * 2;
              const u = rng() * 2 - 1;
              const sp = 20 + rng() * 35;
              p.p.copy(hole);
              p.v.set(Math.cos(a) * Math.sqrt(1 - u * u) * sp, u * sp, Math.sin(a) * Math.sqrt(1 - u * u) * sp);
            }
            tgt.set(text.positions[i * 3], text.positions[i * 3 + 1], text.positions[i * 3 + 2]);
            const k = smooth(0.5, 2.0, te) * 18;
            p.v.addScaledVector(tgt.sub(p.p), k * dt).multiplyScalar(Math.exp(-(2 + k * 0.35) * dt));
            p.v.y -= (1 - smooth(0.5, 2, te)) * 4 * dt;
            p.p.addScaledVector(p.v, dt);
            const settle = smooth(1.5, 3.5, te);
            e.set(lerp(p.spin.x * t, Math.sin(t * 2 + i) * 0.4, settle), lerp(p.spin.y * t, Math.cos(t * 1.7 + i) * 0.4, settle), p.spin.z * t * (1 - settle));
            s.setScalar(p.size * lerp(1.2, 0.75, settle));
          }
          q.setFromEuler(e);
          m4.compose(p.p, q, s);
          petals.setMatrixAt(i, m4);
        }
        if (t >= tWhite) ejected = true;
        petals.instanceMatrix.needsUpdate = true;
      },
      resize(w, h) {
        bgUniforms.uAspect.value = w / h;
      },
    };
  },
};

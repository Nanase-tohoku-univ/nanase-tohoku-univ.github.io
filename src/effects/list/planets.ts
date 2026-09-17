import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { GLSL_NOISE, TEXT_LIFT, Timeline, easeInCubic, fitDistance, glowTexture, lerp, sampleTextPoints, smooth, starMaterial } from '../util';

function planetMaterial(a: THREE.Color, b: THREE.Color, seed: number, lava: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uA: { value: a }, uB: { value: b }, uSeed: { value: seed }, uHeat: { value: 0 }, uLight: { value: new THREE.Vector3(1, 0.6, 0.8).normalize() }, uT: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP; varying vec3 vW;
      void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB, uLight; uniform float uSeed, uHeat, uT;
      varying vec3 vN; varying vec3 vP; varying vec3 vW;
      ${GLSL_NOISE}
      void main(){
        vec3 p = normalize(vP) * 2.2 + uSeed;
        float n = snoise(p) * 0.6 + snoise(p * 2.3) * 0.3 + snoise(p * 5.1) * 0.12;
        vec3 col = mix(uA, uB, smoothstep(-0.2, 0.35, n));
        ${lava ? 'col = mix(col, vec3(1.0,0.35,0.05) * 2.0, smoothstep(0.35, 0.55, n) * 0.8);' : ''}
        float diff = max(dot(normalize(vN), normalize((viewMatrix * vec4(uLight, 0.0)).xyz)), 0.0);
        vec3 lit = col * (0.08 + diff);
        float cracks = smoothstep(0.02, 0.0, abs(snoise(p * 3.0 + uT * 0.3)));
        lit += vec3(1.0, 0.45, 0.1) * cracks * uHeat * 3.0;
        lit += vec3(1.0, 0.6, 0.3) * uHeat * 0.6;
        float rim = pow(1.0 - max(dot(normalize(vN), vec3(0.0,0.0,1.0)), 0.0), 3.0);
        lit += mix(uB, vec3(0.6,0.8,1.0), 0.5) * rim * 0.35;
        lit = min(lit, vec3(0.85));
        gl_FragColor = vec4(lit, 1.0);
      }`,
  });
}

export const planets: EffectFactory = {
  id: 'planets',
  title: '惑星衝突',
  description: '2つの惑星が激突し、飛び散った破片のリングが残り日数を刻む',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    scene.background = new THREE.Color(0x000002);
    const textH = 7;
    const lift = -textH * TEXT_LIFT;

    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(4000 * 3);
    for (let i = 0; i < 4000; i++) {
      const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(400);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(starGeo, starMaterial(2.4, 0.9)));

    const R = 5;
    const pA = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), planetMaterial(palette.colors[0].clone().multiplyScalar(0.8), palette.colors[2], rng() * 10, false));
    const pB = new THREE.Mesh(new THREE.SphereGeometry(R * 0.8, 64, 48), planetMaterial(new THREE.Color(0x3a1d0e), palette.colors[1], rng() * 10, true));
    scene.add(pA, pB);

    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.7, 0.35).multiplyScalar(2) });
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), coreMat);
    core.visible = false;
    scene.add(core);
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture(128, 0.05), color: new THREE.Color(1, 0.6, 0.3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
    const glow = new THREE.Sprite(glowMat);
    scene.add(glow);

    // shockwave
    const shockMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uC: { value: palette.colors[3] } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uT; uniform vec3 uC; varying vec2 vUv;
        void main(){ float d = length(vUv-0.5)*2.0; float r = uT; float a = exp(-pow((d-r)*14.0,2.0)) * (1.0-smoothstep(0.5,1.0,r)); gl_FragColor = vec4(uC*a*2.5, a); }`,
    });
    const shock = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), shockMat);
    shock.rotation.x = -Math.PI / 2 + 0.25;
    shock.visible = false;
    scene.add(shock);

    // debris
    const n = Math.floor(2400 * (0.4 + 0.6 * quality) * (0.7 + 0.3 * intensity));
    const text = sampleTextPoints(ctx.label, n, rng, textH, 1.0);
    const dist = fitDistance(camera, text.width, textH, 0.8);
    const rockGeo = new THREE.IcosahedronGeometry(0.16, 0);
    const rockMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1, emissive: new THREE.Color(1, 0.35, 0.05), emissiveIntensity: 1 });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, n);
    rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rocks.frustumCulled = false;
    rocks.visible = false;
    const rockColors = [palette.colors[1], palette.colors[2], new THREE.Color(0x8a6a50), new THREE.Color(0x5a4a44)];
    const rs = Array.from({ length: n }, (_, i) => {
      rocks.setColorAt(i, rng.pick(rockColors));
      return {
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        rot: new THREE.Euler(rng() * 6, rng() * 6, rng() * 6),
        spin: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(6),
        ring: 11 + rng() * 6,
        s: 0.6 + rng() * 1.6,
      };
    });
    scene.add(rocks);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(10, 6, 8);
    scene.add(sun);
    const fire = new THREE.PointLight(0xff8a30, 0, 80);
    scene.add(fire);

    const tImpact = 3.4;
    const tForm = 6.0;
    const tl = new Timeline()
      .at(0.1, () => sfx.drone(tImpact, 0, 32.7))
      .at(1.4, () => sfx.riser(tImpact - 1.4))
      .at(tImpact, () => {
        pA.visible = pB.visible = false;
        core.visible = true;
        rocks.visible = true;
        shock.visible = true;
        for (const r of rs) {
          const dir = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.35, rng() - 0.5).normalize();
          r.p.copy(dir).multiplyScalar(rng() * 2);
          r.v.copy(dir).multiplyScalar(10 + rng() * 25);
        }
        sfx.boom(1.5);
        sfx.crackle(2);
        post.flash(1, 0xfff0d0);
        post.shake(3 + intensity * 3);
        post.setAberration(4);
        ctx.haptic([0, 250, 50, 150]);
      })
      .at(tForm - 0.3, () => sfx.whoosh(1.5))
      .at(tForm + 1.4, () => {
        sfx.chord(0, 146.83, 3);
        sfx.sparkle(20, 0, 1.5);
        post.shake(0.5);
      });

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    return {
      duration: tForm + 2.6,
      revealAt: tForm + 1.8,
      update(t, dt) {
        tl.run(t);
        // approach
        const app = easeInCubic(smooth(0, tImpact, t));
        pA.position.set(lerp(-26, -R * 0.5, app), lerp(3, 0.2, app), lerp(-6, 0, app));
        pB.position.set(lerp(24, R * 0.5, app), lerp(-2, -0.2, app), lerp(4, 0, app));
        pA.rotation.y = t * 0.3;
        pB.rotation.y = -t * 0.5;
        (pA.material as THREE.ShaderMaterial).uniforms.uHeat.value = smooth(tImpact - 1, tImpact, t);
        (pB.material as THREE.ShaderMaterial).uniforms.uHeat.value = smooth(tImpact - 1, tImpact, t);
        (pA.material as THREE.ShaderMaterial).uniforms.uT.value = t;
        (pB.material as THREE.ShaderMaterial).uniforms.uT.value = t;

        const te = t - tImpact;
        if (te >= 0) {
          const coreS = te < 0.3 ? lerp(1, 4.5, te / 0.3) : lerp(4.5, 1.6, smooth(0.3, 2, te));
          core.scale.setScalar(coreS);
          coreMat.color.setRGB(1, 0.62, 0.3).multiplyScalar(lerp(1.6, 0.9, smooth(0, 2, te)));
          glowMat.opacity = lerp(0.9, 0.45, smooth(0, 2, te));
          glow.scale.setScalar(coreS * 4);
          fire.intensity = lerp(250, 40, smooth(0, 2, te));
          shockMat.uniforms.uT.value = Math.min(1, te * 0.5);
          post.setAberration(lerp(4, 0.4, smooth(0, 1.5, te)));
          const form = smooth(tForm - tImpact - 0.5, tForm - tImpact + 1.5, te);
          core.position.z = lerp(0, -8, form);
          glow.position.copy(core.position);
          fire.position.copy(core.position);

          for (let i = 0; i < n; i++) {
            const r = rs[i];
            if (t < tForm) {
              // settle into an orbital ring
              const rad = Math.hypot(r.p.x, r.p.z) + 1e-3;
              tangent.set(-r.p.z / rad, 0, r.p.x / rad);
              const radialErr = r.ring - rad;
              r.v.x += (r.p.x / rad) * radialErr * 3 * dt + tangent.x * 12 * dt;
              r.v.z += (r.p.z / rad) * radialErr * 3 * dt + tangent.z * 12 * dt;
              r.v.y += -r.p.y * 3 * dt;
              r.v.multiplyScalar(Math.exp(-1.6 * dt));
            } else {
              tgt.set(text.positions[i * 3], text.positions[i * 3 + 1], text.positions[i * 3 + 2]);
              const k = 22 * smooth(tForm, tForm + 0.8 + (i / n) * 0.8, t);
              r.v.addScaledVector(tgt.sub(r.p), k * dt).multiplyScalar(Math.exp(-(2 + k * 0.4) * dt));
            }
            r.p.addScaledVector(r.v, dt);
            r.rot.x += r.spin.x * dt;
            r.rot.y += r.spin.y * dt;
            q.setFromEuler(r.rot);
            sc.setScalar(r.s * lerp(1, 0.75, form));
            m4.compose(r.p, q, sc);
            rocks.setMatrixAt(i, m4);
          }
          rocks.instanceMatrix.needsUpdate = true;
          rockMat.emissiveIntensity = lerp(1.2, 0.15, smooth(0, 4, te));
        }

        // camera: wide side view → tilted over the ring → front of the number
        const ringView = smooth(tImpact, tImpact + 1.5, t);
        const front = smooth(tForm - 0.2, tForm + 1.6, t);
        const pos = new THREE.Vector3(0, 6, 44).lerp(new THREE.Vector3(0, 26, 30), ringView).lerp(new THREE.Vector3(0, lift, dist), front);
        camera.position.copy(pos);
        camera.lookAt(0, lerp(0, lift, front), 0);
        post.setBloom(0.8, 0.45, 0.55);
      },
    };
  },
};

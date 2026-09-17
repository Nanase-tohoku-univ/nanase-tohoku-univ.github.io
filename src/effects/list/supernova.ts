import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { Timeline, easeInCubic, easeInOutCubic, fitDistance, lerp, sampleTextPoints, smooth, starMaterial, pointScale, TEXT_LIFT } from '../util';

const vert = /* glsl */ `
  uniform float uTime, uCollapse, uExplodeT, uForm, uSize, uPR, uShimmer;
  attribute vec3 aGalaxy;
  attribute vec3 aTarget;
  attribute vec3 aDir;
  attribute vec4 aRand;
  varying vec3 vColor;
  varying float vAlpha;
  uniform vec3 uC0, uC1, uC2, uC3, uHot;

  mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  void main(){
    // galaxy: differential rotation, tighter spin as it collapses
    float r = length(aGalaxy.xz);
    float spin = uTime * (0.25 + 1.2 / (r * 0.25 + 0.6)) + uCollapse * uCollapse * 14.0 / (r * 0.2 + 0.3);
    vec3 g = aGalaxy;
    g.xz = rot(spin) * g.xz;
    g *= 1.0 - easeIn(uCollapse);

    // explosion: fast outward, strong drag
    float te = max(uExplodeT, 0.0);
    float burst = (1.0 - exp(-te * (2.2 + aRand.x * 2.0))) * (22.0 + aRand.y * 40.0);
    vec3 e = aDir * burst + vec3(0.0, -te * te * 0.2 * aRand.z, 0.0);
    vec3 p = uExplodeT > 0.0 ? e : g;

    // form the number, staggered per particle
    float f = clamp((uForm - aRand.w * 0.45) / 0.55, 0.0, 1.0);
    f = f < 0.5 ? 4.0 * f * f * f : 1.0 - pow(-2.0 * f + 2.0, 3.0) / 2.0;
    vec3 swirl = vec3(sin(aRand.x * 40.0 + uTime * 2.0), cos(aRand.y * 40.0 + uTime * 1.7), sin(aRand.z * 40.0 + uTime)) * (1.0 - f) * 4.0;
    vec3 tgt = aTarget + vec3(sin(uTime * 1.5 + aRand.x * 30.0), cos(uTime * 1.3 + aRand.y * 30.0), 0.0) * 0.05 * uShimmer;
    p = mix(p, tgt, f) + swirl * f * (1.0 - f) * 2.0;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = uSize * (0.4 + aRand.z * 0.9);
    size *= 1.0 + (1.0 - clamp(te * 1.5, 0.0, 1.0)) * step(0.0001, uExplodeT) * 2.5;
    gl_PointSize = max(1.0, size * uPR / -mv.z);

    vec3 galaxyCol = mix(uC3, mix(uC1, uC0, smoothstep(2.0, 16.0, r)), smoothstep(0.5, 6.0, r));
    vec3 explodeCol = mix(uHot, mix(uC2, uC1, aRand.y), clamp(te * 0.8, 0.0, 1.0));
    vec3 col = uExplodeT > 0.0 ? explodeCol : galaxyCol;
    float twinkle = 0.75 + 0.25 * sin(uTime * (3.0 + aRand.x * 6.0) + aRand.y * 50.0);
    vec3 formed = mix(mix(uC1, uC2, aRand.y), uHot, pow(aRand.x, 4.0));
    col = mix(col, formed, f) * mix(1.0, twinkle, f);
    vColor = col;
    vAlpha = 0.9;
  }
`.replace('void main(){', 'float easeIn(float x){ return x * x * x; }\nvoid main(){');

const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.0, d);
    a = a * a;
    gl_FragColor = vec4(vColor * a * 1.6, a * vAlpha);
  }
`;

export const supernova: EffectFactory = {
  id: 'supernova',
  title: '超新星数字',
  description: '銀河が崩壊し、超新星爆発の残骸が残り日数を形づくる',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    const count = Math.floor(70000 * quality * (0.55 + 0.45 * intensity));

    const textHeight = 7;
    const text = sampleTextPoints(ctx.label, count, rng, textHeight, 0.8);

    const geo = new THREE.BufferGeometry();
    const galaxy = new Float32Array(count * 3);
    const dirs = new Float32Array(count * 3);
    const rand = new Float32Array(count * 4);
    const arms = rng.int(2, 5);
    const twist = rng.range(0.25, 0.6);
    for (let i = 0; i < count; i++) {
      const r = Math.pow(rng(), 1.6) * 20 + 0.2;
      const arm = (Math.floor(rng() * arms) / arms) * Math.PI * 2;
      const a = arm + r * twist + (rng() - 0.5) * (1.2 / (r * 0.15 + 0.5));
      galaxy[i * 3] = Math.cos(a) * r + (rng() - 0.5) * 0.8;
      galaxy[i * 3 + 1] = (rng() - 0.5) * (1.6 / (r * 0.2 + 0.6));
      galaxy[i * 3 + 2] = Math.sin(a) * r + (rng() - 0.5) * 0.8;
      const u = rng() * 2 - 1;
      const th = rng() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      dirs[i * 3] = s * Math.cos(th);
      dirs[i * 3 + 1] = u;
      dirs[i * 3 + 2] = s * Math.sin(th);
      rand.set([rng(), rng(), rng(), rng()], i * 4);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(galaxy, 3));
    geo.setAttribute('aGalaxy', new THREE.BufferAttribute(galaxy, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(text.positions, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

    const uniforms = {
      uTime: { value: 0 },
      uCollapse: { value: 0 },
      uExplodeT: { value: -1 },
      uForm: { value: 0 },
      uSize: { value: 0.085 },
      // "PR" here is the resolution-independent point scale (pixels per world unit at depth 1)
      uPR: { value: pointScale(ctx.renderer, camera) },
      uShimmer: { value: 1 },
      uC0: { value: palette.colors[0] },
      uC1: { value: palette.colors[1] },
      uC2: { value: palette.colors[2] },
      uC3: { value: palette.colors[3] },
      uHot: { value: palette.hot },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.rotation.x = 0.35;
    scene.add(points);

    // background stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) {
      const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(300 + rng() * 300);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, starMaterial());
    scene.add(stars);

    // shockwave ring
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uColor: { value: palette.colors[2] } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uT; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float d = length(vUv - 0.5) * 2.0;
          float r = uT;
          float ring = exp(-pow((d - r) * 18.0, 2.0)) * (1.0 - smoothstep(0.6, 1.0, r));
          gl_FragColor = vec4(uColor * ring * 3.0, ring);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), ringMat);
    ring.rotation.x = -Math.PI / 2 + 0.35;
    ring.visible = false;
    scene.add(ring);

    // collapsing core glow
    const coreMat = new THREE.SpriteMaterial({ color: palette.hot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const core = new THREE.Sprite(coreMat);
    scene.add(core);

    const finalDist = fitDistance(camera, text.width, textHeight, 0.8);
    const tExplode = 3.6;
    const tl = new Timeline()
      .at(0.1, () => sfx.drone(3.5))
      .at(1.2, () => sfx.riser(tExplode - 1.2))
      .at(tExplode, () => {
        sfx.boom(1.2);
        post.flash(1, palette.hot);
        post.shake(3 * intensity + 0.5);
        post.setAberration(3);
        ctx.haptic([0, 120, 40, 200]);
        ring.visible = true;
      })
      .at(tExplode + 1.1, () => sfx.whoosh(1.8))
      .at(tExplode + 3.0, () => {
        sfx.chord(0, 196);
        sfx.sparkle(24, 0.1, 2);
        post.shake(0.6);
        ctx.haptic([0, 60]);
      });

    return {
      duration: 8.5,
      revealAt: tExplode + 3.4,
      update(t) {
        tl.run(t);
        uniforms.uTime.value = t;
        uniforms.uCollapse.value = smooth(1.8, tExplode, t);
        uniforms.uExplodeT.value = t >= tExplode ? t - tExplode : -1;
        uniforms.uForm.value = smooth(tExplode + 1.0, tExplode + 4.4, t);

        const collapse = uniforms.uCollapse.value;
        coreMat.opacity = t < tExplode ? easeInCubic(collapse) : 0;
        core.scale.setScalar(2 + collapse * 6 + Math.sin(t * 40) * collapse);

        const te = t - tExplode;
        if (te > 0) {
          ringMat.uniforms.uT.value = Math.min(1, te * 0.6);
          post.setAberration(lerp(3, 0.4, Math.min(1, te)));
          points.rotation.x = lerp(0.35, 0, smooth(1, 4, te));
        }

        const approach = easeInOutCubic(smooth(tExplode + 0.5, tExplode + 4.5, t));
        const orbit = t * 0.12 * (1 - approach);
        const startR = 42 - collapse * 10;
        const lift = -textHeight * TEXT_LIFT * approach;
        camera.position.set(Math.sin(orbit) * lerp(startR, 0, approach), lerp(16, lift, approach), lerp(Math.cos(orbit) * startR, finalDist, approach));
        camera.lookAt(0, lift, 0);
        stars.rotation.y = t * 0.01;
        post.setBloom(lerp(1.4, 0.9, approach) + (te > 0 && te < 0.6 ? 1.5 * (1 - te / 0.6) : 0), 0.7, 0.05);
      },
      resize() {
        uniforms.uPR.value = pointScale(ctx.renderer, camera);
      },
    };
  },
};

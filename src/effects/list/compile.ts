import * as THREE from 'three';
import type { EffectFactory } from '../types';
import { Timeline, TEXT_LIFT, canvasTexture, easeInCubic, fitDistance, lerp, pointScale, sampleTextPoints, smooth } from '../util';

const SOURCE = String.raw`\documentclass[master]{univ-thesis}
\usepackage{amsmath,amssymb,graphicx,hyperref}
\title{修士論文} \author{M2}
\begin{document}
\maketitle
\chapter{序論}
\section{研究背景}
本研究の目的は \cite{goat2019} を拡張することである．
\begin{equation}
  \mathcal{L}(\theta) = -\sum_{i=1}^{N} \log p_\theta(y_i \mid x_i)
\end{equation}
\begin{figure}[htbp]
  \centering\includegraphics[width=0.9\linewidth]{fig/result.pdf}
  \caption{提案手法の概要}\label{fig:overview}
\end{figure}
\section{関連研究}
\begin{align}
  \nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
  \oint_{\partial\Sigma} \mathbf{B}\cdot d\boldsymbol{\ell} &= \mu_0 I
\end{align}
\chapter{提案手法}
\begin{algorithm}\caption{Graduate}
  \While{days > 0}{ research(); write(); sleep(); days--; }
\end{algorithm}
\chapter{実験}
\begin{table}[t]\centering
  \begin{tabular}{lcc}\toprule
  Method & Acc. & F1 \\ \midrule
  Ours & \textbf{98.7} & \textbf{97.2} \\ \bottomrule
  \end{tabular}
\end{table}
\chapter{結論}
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
\bibliographystyle{junsrt}\bibliography{refs}
\end{document}`.split('\n');

const LOG = [
  'This is pdfTeX, Version 3.141592653',
  'entering extended mode',
  '(./thesis.tex',
  'LaTeX2e <2026-06-01>',
  '(./chapter1.tex [1] [2] [3])',
  '(./chapter2.tex [4] [5] [6] [7])',
  'Overfull \\hbox (0.4pt too wide) in paragraph',
  '(./chapter3.tex [8] [9] [10] [11] [12])',
  '(./chapter4.tex [13] [14] [15] [16])',
  'LaTeX Warning: Label(s) may have changed.',
  '(./chapter5.tex [17] [18])',
  '(./thesis.bbl [19] [20])',
  'Output written on thesis.pdf',
];

const GLYPHS = '∑∫∂∇αβγδεθλμπρσφψωΩΔΓΛ∞≈≠≤≥√∈∀∃⊂∪∩ℝℕ{}[]()\\$^_=+×÷±∮∏ℏ∠⟨⟩→⇒∝';
const ATLAS = 8;

export const compile: EffectFactory = {
  id: 'compile',
  title: '修論コンパイル',
  description: 'LaTeXのソースが超高速で流れ、コンパイルされた数式が残り日数を組み上げる',
  create(ctx) {
    const { scene, camera, rng, palette, intensity, quality, sfx, post } = ctx;
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.012);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);

    const c1 = `#${palette.colors[1].getHexString()}`;
    const c2 = `#${palette.colors[2].getHexString()}`;
    const c3 = `#${palette.colors[3].getHexString()}`;

    // tunnel of source code
    const codeTex = canvasTexture(2048, 2048, (g, w, h) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.font = '30px "Consolas", "Menlo", monospace';
      let y = 36;
      let line = 0;
      while (y < h) {
        for (let x = 20; x < w; x += 1020) {
          const src = SOURCE[(line + Math.floor(x / 1020) * 7) % SOURCE.length];
          let cx = x;
          for (const tok of src.split(/(\\[a-zA-Z]+|[{}$^_])/)) {
            if (!tok) continue;
            g.fillStyle = tok.startsWith('\\') ? c2 : /[{}$^_]/.test(tok) ? c3 : 'rgba(210,220,230,0.8)';
            g.fillText(tok, cx, y);
            cx += g.measureText(tok).width;
          }
        }
        y += 38;
        line++;
      }
    });
    codeTex.wrapS = codeTex.wrapT = THREE.RepeatWrapping;
    codeTex.repeat.set(3, 6);
    const tunnelMat = new THREE.MeshBasicMaterial({ map: codeTex, side: THREE.BackSide, transparent: true, fog: true });
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 400, 48, 1, true), tunnelMat);
    tunnel.rotation.x = Math.PI / 2;
    tunnel.position.z = -150;
    scene.add(tunnel);

    // compile log HUD
    const logCanvas = document.createElement('canvas');
    logCanvas.width = 1024;
    logCanvas.height = 512;
    const logG = logCanvas.getContext('2d')!;
    const logTex = new THREE.CanvasTexture(logCanvas);
    logTex.colorSpace = THREE.SRGBColorSpace;
    const logMat = new THREE.MeshBasicMaterial({ map: logTex, transparent: true, depthTest: false, fog: false });
    const logPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), logMat);
    logPlane.renderOrder = 10;
    scene.add(logPlane);
    let logLines = 0;
    const drawLog = (progress: number) => {
      logG.clearRect(0, 0, 1024, 512);
      logG.fillStyle = 'rgba(0,0,0,0.55)';
      logG.fillRect(0, 0, 1024, 512);
      logG.strokeStyle = c1;
      logG.lineWidth = 3;
      logG.strokeRect(2, 2, 1020, 508);
      logG.font = 'bold 30px "Consolas", monospace';
      logG.fillStyle = c3;
      logG.fillText('$ latexmk -pdf thesis.tex', 24, 46);
      logG.font = '26px "Consolas", monospace';
      const start = Math.max(0, logLines - 11);
      for (let i = start; i < logLines; i++) {
        logG.fillStyle = LOG[i].includes('Warning') || LOG[i].includes('Overfull') ? '#ffb020' : 'rgba(220,230,240,0.9)';
        logG.fillText(LOG[i], 24, 86 + (i - start) * 34);
      }
      logG.fillStyle = 'rgba(255,255,255,0.15)';
      logG.fillRect(24, 470, 976, 20);
      logG.fillStyle = c2;
      logG.fillRect(24, 470, 976 * progress, 20);
      logTex.needsUpdate = true;
    };

    // glyph atlas + text particles
    const atlas = canvasTexture(512, 512, (g, w) => {
      const cell = w / ATLAS;
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${cell * 0.72}px "Cambria Math", "Times New Roman", serif`;
      [...GLYPHS].slice(0, ATLAS * ATLAS).forEach((ch, i) => {
        g.fillText(ch, (i % ATLAS) * cell + cell / 2, Math.floor(i / ATLAS) * cell + cell / 2);
      });
    });
    const glyphCount = Math.min([...GLYPHS].length, ATLAS * ATLAS);

    const textH = 6;
    const n = Math.floor(2600 * (0.5 + 0.5 * quality) * (0.6 + 0.4 * intensity));
    const text = sampleTextPoints(ctx.label, n, rng, textH, 0.6);
    const dist = fitDistance(camera, text.width, textH, 0.8);
    const start = new Float32Array(n * 3);
    const rand = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      start.set([Math.cos(a) * 8.5, Math.sin(a) * 8.5, -rng() * 120 - 2], i * 3);
      rand.set([rng(), rng(), Math.floor(rng() * glyphCount), rng()], i * 4);
      text.positions[i * 3 + 2] -= dist;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(start, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(text.positions, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const glyphUniforms = {
      uT: { value: 0 },
      uForm: { value: 0 },
      uAtlas: { value: atlas },
      uPR: { value: pointScale(ctx.renderer, camera) },
      uC1: { value: palette.colors[1] },
      uC3: { value: palette.colors[3] },
      uHot: { value: palette.hot },
      uCount: { value: glyphCount },
    };
    const glyphMat = new THREE.ShaderMaterial({
      uniforms: glyphUniforms,
      vertexShader: /* glsl */ `
        uniform float uT, uForm, uPR, uCount;
        uniform vec3 uC1, uC3, uHot;
        attribute vec3 aTarget;
        attribute vec4 aRand;
        varying vec3 vColor;
        varying float vGlyph, vAlpha;
        void main(){
          float f = clamp((uForm - aRand.x * 0.5) / 0.5, 0.0, 1.0);
          float e = 1.0 - pow(1.0 - f, 4.0);
          vec3 p;
          vec3 mid = mix(position, aTarget, 0.5) + vec3((aRand.y - 0.5) * 30.0, (aRand.w - 0.5) * 30.0, 10.0);
          vec3 a = mix(position, mid, e);
          vec3 b = mix(mid, aTarget, e);
          p = uForm > 0.0 ? mix(a, b, e) : position;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.42 + 0.5 * (1.0 - e)) * uPR / -mv.z * (0.6 + aRand.w * 0.7);
          float swap = floor(uT * (2.0 + aRand.y * 8.0) * (1.0 - e * 0.8));
          vGlyph = mod(aRand.z + swap, uCount);
          vColor = mix(mix(uC1, uC3, aRand.y), uHot, e * 0.7);
          vAlpha = uForm > 0.0 ? 1.0 : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uAtlas;
        varying vec3 vColor;
        varying float vGlyph, vAlpha;
        void main(){
          float cell = 1.0 / ${ATLAS}.0;
          vec2 base = vec2(mod(vGlyph, ${ATLAS}.0), floor(vGlyph / ${ATLAS}.0));
          vec2 uv = (base + vec2(gl_PointCoord.x, gl_PointCoord.y)) * cell;
          uv.y = 1.0 - uv.y;
          float a = texture2D(uAtlas, uv).a * vAlpha;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor * 1.1, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glyphs = new THREE.Points(geo, glyphMat);
    scene.add(glyphs);

    // "\end{countdown}" caption
    const capTex = canvasTexture(1024, 128, (g, w, h) => {
      g.font = 'bold 64px "Consolas", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = c3;
      g.fillText('\\end{countdown}', w / 2, h / 2);
    });
    const capMat = new THREE.MeshBasicMaterial({ map: capTex, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(text.width * 0.9, text.width * 0.9 * 0.125), capMat);
    cap.position.set(0, -textH * 0.85, -dist);
    scene.add(cap);

    const tForm = 4.2;
    const tl = new Timeline().at(0.05, () => sfx.riser(tForm - 0.1)).at(tForm, () => {
      sfx.boom(1);
      sfx.glitch(0.25);
      post.flash(0.9, palette.colors[2]);
      post.shake(1.5 * intensity);
      ctx.haptic([0, 80, 30, 120]);
    });
    tl.at(tForm + 1.9, () => {
      sfx.chord(0, 246.94);
      sfx.sparkle(20, 0, 1.5);
    });
    for (let i = 0; i < 40; i++) tl.at(0.1 + i * 0.1, () => sfx.tick(0, 1800 + rng() * 1600));

    let speed = 0;
    let logTimer = 0;
    drawLog(0);
    return {
      duration: 8.2,
      revealAt: tForm + 2.3,
      update(t, dt) {
        tl.run(t);
        const pre = smooth(0, tForm, t);
        speed = lerp(0.2, 6, easeInCubic(pre));
        codeTex.offset.y += speed * dt * (t < tForm ? 1 : Math.max(0, 1 - (t - tForm) * 2));
        tunnel.rotation.y = t * 0.1 * pre;
        tunnelMat.opacity = t < tForm ? 1 : Math.max(0, 1 - (t - tForm) * 1.5);
        post.setWarp(t < tForm ? pre * 1.4 : Math.max(0, 1.4 - (t - tForm) * 3));
        post.setBloom(t < tForm ? 0.6 + pre : 0.75, 0.45, 0.2);

        logTimer -= dt;
        if (t < tForm && logTimer <= 0) {
          logTimer = (tForm - 0.3) / LOG.length;
          logLines = Math.min(LOG.length, logLines + 1);
          drawLog(logLines / LOG.length);
        }
        const hudFade = t < tForm ? 1 : Math.max(0, 1 - (t - tForm) * 4);
        logMat.opacity = hudFade;
        const hudDist = 2.2;
        const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * hudDist;
        const hudW = Math.min(vh * camera.aspect * 0.92, vh * 0.9);
        logPlane.scale.set(hudW, hudW, 1);
        logPlane.position.set(0, -vh * 0.5 + hudW * 0.25 + vh * 0.04, -hudDist);

        glyphUniforms.uT.value = t;
        glyphUniforms.uForm.value = t < tForm ? 0 : smooth(tForm, tForm + 2.6, t);
        capMat.opacity = smooth(tForm + 2.4, tForm + 3.2, t);
        camera.position.x = Math.sin(t * 0.5) * 0.3 * (t > tForm + 2 ? 1 : 0);
        camera.position.y = Math.cos(t * 0.4) * 0.2 * (t > tForm + 2 ? 1 : 0);
        camera.lookAt(0, -textH * TEXT_LIFT * smooth(tForm, tForm + 2, t), -dist);
      },
      resize() {
        glyphUniforms.uPR.value = pointScale(ctx.renderer, camera);
      },
    };
  },
};

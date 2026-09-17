import type { Effect, EffectFactory } from '../types';
import { disposeObject } from '../util';
import { supernova } from './supernova';
import { sakuraHole } from './sakuraHole';
import { fireworks } from './fireworks';

const CHAPTERS: EffectFactory[] = [supernova, sakuraHole, fireworks];
const HOLD = 1.2;

/** Graduation day: plays several effects back to back, ending in fireworks. */
export const finale: EffectFactory = {
  id: 'finale',
  title: '修了総集編',
  description: '修了の日だけの特別演出。超新星・桜・花火を連続で',
  create(ctx) {
    const { scene, camera } = ctx;
    let index = 0;
    let offset = 0;
    let current: Effect = CHAPTERS[0].create(ctx);

    const next = () => {
      current.dispose?.();
      disposeObject(scene);
      scene.clear();
      scene.background = ctx.palette.bg.clone();
      scene.fog = null;
      scene.environment = null;
      camera.position.set(0, 0, 30);
      camera.up.set(0, 1, 0);
      camera.fov = 50;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
      ctx.post.setWarp(0);
      ctx.post.setAberration(0.3);
      ctx.post.flash(1, 0xffffff);
      index++;
      current = CHAPTERS[index].create({ ...ctx, intensity: 1 });
    };

    return {
      get duration() {
        return offset + current.duration + (index < CHAPTERS.length - 1 ? 999 : 0);
      },
      get revealAt() {
        return index < CHAPTERS.length - 1 ? 1e9 : offset + current.revealAt;
      },
      update(t, dt) {
        const local = t - offset;
        if (index < CHAPTERS.length - 1 && local > current.duration + HOLD) {
          offset = t;
          next();
          current.update(0, dt);
          return;
        }
        current.update(local, dt);
      },
      resize(w, h) {
        current.resize?.(w, h);
      },
      tap(x, y) {
        current.tap?.(x, y);
      },
      dispose() {
        current.dispose?.();
      },
    };
  },
};

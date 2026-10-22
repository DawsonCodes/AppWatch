/**
 * AppWatch motion (JavaScript side) — deliberately small.
 *
 * Almost all motion is plain CSS: short fades and color changes that can't
 * get stuck, overlap or hide content. The only scripted effects are the
 * circular theme reveal and the watch star's pop. Both are skipped under
 * prefers-reduced-motion.
 */

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function isPaintTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'ms-paint';
}

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition?: () => void;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

let themeTransition: ViewTransitionLike | null = null;

/** Theme change revealed as a growing circle from `origin` (stepped in MS Paint). */
export function themeReveal(update: () => void, origin: Element | null, toPaint: boolean): void {
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;
  if (typeof start !== 'function' || prefersReducedMotion() || document.hidden) {
    update();
    return;
  }
  themeTransition?.skipTransition?.();
  const rect = origin?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 40;
  const y = rect ? rect.top + rect.height / 2 : 30;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  const root = document.documentElement;
  root.dataset.vt = 'theme';
  const vt = start.call(document, update);
  themeTransition = vt;
  vt.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: toPaint ? 720 : 620,
          easing: toPaint ? 'steps(9, end)' : 'cubic-bezier(0.65, 0, 0.25, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {});
  vt.finished
    .catch(() => {})
    .finally(() => {
      if (themeTransition === vt) {
        themeTransition = null;
        delete root.dataset.vt;
      }
    });
}

/** A quick pop when an app is watched; a small dip when it's unwatched. */
export function starPop(el: Element, watching: boolean): void {
  if (prefersReducedMotion() || typeof (el as HTMLElement).animate !== 'function') return;
  for (const animation of el.getAnimations()) animation.cancel();
  const paint = isPaintTheme();
  el.animate(
    watching
      ? [
          { transform: 'scale(1)' },
          { transform: 'scale(1.35)', offset: 0.4 },
          { transform: 'scale(1)' },
        ]
      : [
          { transform: 'scale(1)' },
          { transform: 'scale(0.8)', offset: 0.4 },
          { transform: 'scale(1)' },
        ],
    { duration: paint ? 360 : 320, easing: paint ? 'steps(4, end)' : 'ease-out' },
  );
}

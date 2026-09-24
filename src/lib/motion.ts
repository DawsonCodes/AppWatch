/**
 * AppWatch motion system (JavaScript side). CSS owns the tokens and most
 * keyframes (see styles/motion.css); this module adds what CSS alone can't:
 *
 *  - View Transitions for discrete state changes: grid re-layouts morph,
 *    the tapped card's icon flies into the detail panel, and theme changes
 *    reveal in a circle from the theme button.
 *  - Web Animations for one-off, physics-flavored effects (the star pop and
 *    its spark burst), which clean themselves up when finished.
 *
 * Every entry point is a no-op (instant state change) under
 * prefers-reduced-motion or when the browser lacks the API.
 */

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Spring-like easing via CSS linear(); falls back to a soft ease-out. */
const SPRING_LINEAR =
  'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19.4%, 1.067, 1.099 24.3%, 1.108 26%, 1.103, 1.085 30.4%, 1.019 36.6%, 0.994 41%, 0.989 43.9%, 0.993 49.6%, 1.001 60.7%, 1)';
const FALLBACK_SPRING = 'cubic-bezier(0.2, 0.9, 0.25, 1.15)';

let springCache: string | null = null;
export function springEasing(): string {
  if (springCache) return springCache;
  let supported: boolean;
  try {
    supported = CSS.supports('animation-timing-function', 'linear(0, 1)');
  } catch {
    supported = false;
  }
  springCache = supported ? SPRING_LINEAR : FALLBACK_SPRING;
  return springCache;
}

function isPaintTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'ms-paint';
}

/** Resolve once Preact has flushed pending renders (renders are microtask-batched). */
export function nextRender(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export type TransitionKind = 'grid' | 'detail' | 'theme' | 'view';

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
}

type StartViewTransition = (update: () => Promise<void> | void) => ViewTransitionLike;

function startViewTransition(): StartViewTransition | null {
  const fn = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;
  return typeof fn === 'function' ? fn.bind(document) : null;
}

export function supportsViewTransitions(): boolean {
  return startViewTransition() !== null && !prefersReducedMotion();
}

/**
 * Run a state update inside a View Transition. `kind` is exposed as
 * `data-vt` on <html> for the duration so CSS can pick the choreography.
 * Resolves after the new state is on screen (animation may still run).
 */
export async function transition(
  kind: TransitionKind,
  update: () => void,
  onReady?: (vt: ViewTransitionLike) => void,
  hooks: { afterRender?: () => void; finished?: () => void } = {},
): Promise<void> {
  const start = startViewTransition();
  if (!start || prefersReducedMotion() || document.visibilityState !== 'visible') {
    update();
    await nextRender();
    hooks.afterRender?.();
    hooks.finished?.();
    return;
  }
  const root = document.documentElement;
  root.dataset.vt = kind;
  const vt = start(async () => {
    update();
    await nextRender();
    // Runs before the new state is captured, e.g. to name the element the
    // closing detail panel should morph back into.
    hooks.afterRender?.();
  });
  vt.ready.then(() => onReady?.(vt)).catch(() => {});
  vt.finished
    .catch(() => {})
    .finally(() => {
      if (root.dataset.vt === kind) delete root.dataset.vt;
      hooks.finished?.();
    });
  await vt.ready.catch(() => {});
}

/** Theme change revealed as a growing circle from `origin` (stepped in MS Paint). */
export function themeReveal(update: () => void, origin: Element | null, toPaint: boolean): void {
  const rect = origin?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 40;
  const y = rect ? rect.top + rect.height / 2 : 30;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  void transition('theme', update, () => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
      },
      {
        duration: toPaint ? 700 : 560,
        easing: toPaint ? 'steps(9, end)' : 'cubic-bezier(0.65, 0, 0.25, 1)',
        pseudoElement: '::view-transition-new(root)',
      },
    );
  });
}

/** Springy pop for the watch star; a softer dip when unwatching. */
export function starPop(el: Element, watching: boolean): void {
  if (prefersReducedMotion() || typeof el.animate !== 'function') return;
  if (watching) {
    el.animate(
      [
        { transform: 'translateY(0) scale(1) rotate(0deg)' },
        { transform: 'translateY(-5px) scale(1.42) rotate(-14deg)', offset: 0.32 },
        { transform: 'translateY(0) scale(0.88) rotate(4deg)', offset: 0.62 },
        { transform: 'translateY(0) scale(1) rotate(0deg)' },
      ],
      {
        duration: isPaintTheme() ? 480 : 620,
        easing: isPaintTheme() ? 'steps(6, end)' : 'ease-out',
      },
    );
  } else {
    el.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.72)', opacity: 0.55, offset: 0.45 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 260, easing: 'ease-out' },
    );
  }
}

const PAINT_COLORS = ['#ff0000', '#ffff00', '#0000ff', '#00a000', '#ff00ff', '#00c0c0'];

/**
 * A small firework of gold sparks bursting from `anchor` (the star button).
 * Particles live in a layer appended to the anchor and remove themselves when
 * their animations finish, so rapid clicking can't leak nodes or timers.
 */
export function sparkBurst(anchor: HTMLElement): void {
  if (prefersReducedMotion() || typeof anchor.animate !== 'function') return;
  const paint = isPaintTheme();
  const layer = document.createElement('span');
  layer.className = 'spark-layer';
  layer.setAttribute('aria-hidden', 'true');
  anchor.appendChild(layer);

  const animations: Animation[] = [];
  const count = paint ? 10 : 14;
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('span');
    spark.className = paint ? 'spark spark--pixel' : 'spark';
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = 20 + Math.random() * 16;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const size = paint ? 4 : 2.5 + Math.random() * 3.5;
    spark.style.width = `${size}px`;
    spark.style.height = `${size}px`;
    spark.style.background = paint
      ? PAINT_COLORS[i % PAINT_COLORS.length]!
      : i % 3 === 0
        ? 'var(--spark-2)'
        : 'var(--spark-1)';
    layer.appendChild(spark);
    animations.push(
      spark.animate(
        [
          { transform: 'translate(-50%, -50%) translate(0, 0) scale(1)', opacity: 1 },
          {
            transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(1)`,
            opacity: 1,
            offset: 0.55,
          },
          {
            // A touch of gravity as the spark fades.
            transform: `translate(-50%, -50%) translate(${dx * 1.15}px, ${dy * 1.15 + 9}px) scale(0.2)`,
            opacity: 0,
          },
        ],
        {
          duration: 620 + Math.random() * 260,
          easing: paint ? 'steps(7, end)' : 'cubic-bezier(0.15, 0.7, 0.3, 1)',
          fill: 'forwards',
        },
      ),
    );
  }
  const ring = document.createElement('span');
  ring.className = paint ? 'spark-ring spark-ring--pixel' : 'spark-ring';
  layer.appendChild(ring);
  animations.push(
    ring.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.9 },
        { transform: 'translate(-50%, -50%) scale(2.6)', opacity: 0 },
      ],
      {
        duration: 520,
        easing: paint ? 'steps(5, end)' : 'cubic-bezier(0.2, 0.7, 0.3, 1)',
        fill: 'forwards',
      },
    ),
  );

  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => layer.remove());
}

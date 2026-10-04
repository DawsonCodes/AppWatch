/**
 * AppWatch motion system (JavaScript side).
 *
 * Everything here runs on the Web Animations API, so every animation is
 * interruptible and never blocks input: a new change simply starts from
 * wherever the previous animation had got to. CSS owns the small,
 * self-contained effects (hover, press, menus); this module owns anything
 * that has to measure layout:
 *
 *  - createListMotion(): FLIP for lists (cards glide to their new slots,
 *    newcomers pop in, leavers fade out where they stood), a one-time
 *    entrance cascade, and reveal-on-scroll for items further down.
 *  - flyBetween(): the app icon flying between a card and the detail panel.
 *  - slideIn()/slideOut(): the detail panel and backdrop.
 *  - themeReveal(): the circular theme reveal (the one View Transition left,
 *    because it needs a snapshot of the old theme).
 *  - starPop()/sparkBurst(): the watch star.
 *
 * Under prefers-reduced-motion every entry point is an instant state change.
 */

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function isPaintTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'ms-paint';
}

function canAnimate(el: Element | null | undefined): el is HTMLElement {
  return el instanceof HTMLElement && typeof el.animate === 'function' && !prefersReducedMotion();
}

/* --------------------------------- Easing -------------------------------- */

const SPRING_LINEAR =
  'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 19.4%, 1.067, 1.099 24.3%, 1.108 26%, 1.103, 1.085 30.4%, 1.019 36.6%, 0.994 41%, 0.989 43.9%, 0.993 49.6%, 1.001 60.7%, 1)';
const SOFT_LINEAR =
  'linear(0, 0.012, 0.049 2.4%, 0.199 5.2%, 0.6 11.2%, 0.8 15.2%, 0.906 19%, 0.97 23.3%, 1.004 28.4%, 1.018 34.3%, 1.016 42.7%, 1.004 59%, 1)';

let linearSupported: boolean | null = null;
function supportsLinear(): boolean {
  if (linearSupported === null) {
    try {
      linearSupported = CSS.supports('animation-timing-function', 'linear(0, 1)');
    } catch {
      linearSupported = false;
    }
  }
  return linearSupported;
}

/** Bouncy spring (~10% overshoot) for small things: stars, pops. */
export function spring(): string {
  if (isPaintTheme()) return 'steps(6, end)';
  return supportsLinear() ? SPRING_LINEAR : 'cubic-bezier(0.2, 0.9, 0.25, 1.15)';
}

/** Barely-overshooting spring for big surfaces and layout moves. */
export function springSoft(): string {
  if (isPaintTheme()) return 'steps(7, end)';
  return supportsLinear() ? SOFT_LINEAR : 'cubic-bezier(0.22, 1, 0.36, 1)';
}

export function easeOut(): string {
  return isPaintTheme() ? 'steps(5, end)' : 'cubic-bezier(0.16, 1, 0.3, 1)';
}

export function easeIn(): string {
  return isPaintTheme() ? 'steps(4, end)' : 'cubic-bezier(0.55, 0, 0.75, 0.2)';
}

function cancelById(el: Element, ...ids: string[]): void {
  for (const animation of el.getAnimations()) {
    if (ids.includes(animation.id)) animation.cancel();
  }
}

/* ------------------------------- List motion ----------------------------- */

interface Snap {
  rect: DOMRect;
  opacity: number;
  el: HTMLElement;
  hidden: boolean;
}

export interface ListMotion {
  /** Ref callback for the list container. */
  attach: (root: HTMLElement | null) => void;
  /**
   * Call right before a state change that re-orders, adds or removes items.
   * With `keepInView`, a list scrolled past its top is brought back so the
   * result is visible (e.g. after switching collections).
   */
  capture: (options?: { keepInView?: boolean }) => void;
  /** Call after every render (useLayoutEffect) of the list. */
  afterRender: () => void;
}

interface ListMotionOptions {
  /** Selector for the animated items; each needs a stable `data-key`. */
  item: string;
  /** Animate moves/adds/removes after capture(). */
  flip: boolean;
  /** Pixels reserved at the top of the viewport by sticky chrome. */
  stickyOffset?: () => number;
}

const REVEALED = new WeakSet<Element>();

function keyOf(el: HTMLElement): string {
  return el.dataset.key ?? '';
}

function nearViewport(rect: DOMRect, margin = 120): boolean {
  return rect.bottom > -margin && rect.top < window.innerHeight + margin && rect.width > 0;
}

function enter(el: HTMLElement, delay: number): void {
  el.animate(
    [
      { opacity: 0, transform: 'translateY(16px) scale(0.97)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 560, delay, easing: springSoft(), fill: 'backwards', id: 'enter' },
  );
}

function reveal(el: HTMLElement, delay: number): void {
  el.animate(
    [
      { opacity: 0, transform: 'translateY(28px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 640, delay, easing: easeOut(), fill: 'backwards', id: 'enter' },
  );
}

/** A fading copy of a removed item, left where it stood. */
function ghost(snap: Snap): void {
  const { rect } = snap;
  const copy = snap.el.cloneNode(true) as HTMLElement;
  copy.removeAttribute('data-reveal');
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  copy.classList.add('motion-ghost');
  Object.assign(copy.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    pointerEvents: 'none',
    zIndex: '1',
  });
  document.body.appendChild(copy);
  const animation = copy.animate(
    [
      { opacity: snap.opacity, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.92)' },
    ],
    { duration: 260, easing: easeIn(), fill: 'forwards' },
  );
  const remove = () => copy.remove();
  animation.finished.then(remove, remove);
}

export function createListMotion(options: ListMotionOptions): ListMotion {
  let root: HTMLElement | null = null;
  let snapshot: Map<string, Snap> | null = null;
  let capturedAt = 0;
  let keepInView = false;
  let introDone = false;
  let observer: IntersectionObserver | null = null;

  function items(): HTMLElement[] {
    return root ? Array.from(root.querySelectorAll<HTMLElement>(options.item)) : [];
  }

  function ensureObserver(): IntersectionObserver | null {
    if (observer || typeof IntersectionObserver !== 'function') return observer;
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        visible.forEach((entry, index) => {
          const el = entry.target as HTMLElement;
          observer?.unobserve(el);
          el.removeAttribute('data-reveal');
          REVEALED.add(el);
          if (!prefersReducedMotion()) reveal(el, Math.min(index, 6) * 55);
        });
      },
      { rootMargin: '0px 0px -40px 0px' },
    );
    return observer;
  }

  return {
    attach(el) {
      if (el === root) return;
      root = el;
      if (!el) {
        observer?.disconnect();
        observer = null;
      }
    },

    capture(opts = {}) {
      if (!options.flip || prefersReducedMotion()) return;
      keepInView = opts.keepInView ?? false;
      capturedAt = performance.now();
      // An empty snapshot (list not mounted yet) still marks the next render
      // as a change, so items arriving from an empty state pop in.
      snapshot = new Map();
      for (const el of items()) {
        snapshot.set(keyOf(el), {
          rect: el.getBoundingClientRect(),
          opacity: Number(getComputedStyle(el).opacity),
          el,
          hidden: el.hasAttribute('data-reveal'),
        });
      }
    },

    afterRender() {
      const list = items();
      // A snapshot only describes the change that immediately follows it.
      const previous = snapshot && performance.now() - capturedAt < 1000 ? snapshot : null;
      snapshot = null;

      if (prefersReducedMotion() || !root) {
        for (const el of list) {
          el.removeAttribute('data-reveal');
          REVEALED.add(el);
        }
        introDone = introDone || list.length > 0;
        return;
      }

      if (previous) {
        // Stop in-flight moves first so the new layout is measured cleanly;
        // the snapshot already holds where everything visibly was.
        for (const el of list) cancelById(el, 'flip', 'enter');

        if (keepInView) {
          const top = root.getBoundingClientRect().top;
          const offset = options.stickyOffset?.() ?? 0;
          if (top < offset) window.scrollBy({ top: top - offset - 12, behavior: 'instant' });
        }

        const present = new Set<string>();
        for (const el of list) {
          const key = keyOf(el);
          present.add(key);
          const before = previous.get(key);
          if (!before) continue;
          if (before.hidden) continue;
          const now = el.getBoundingClientRect();
          REVEALED.add(el);
          const dx = before.rect.left - now.left;
          const dy = before.rect.top - now.top;
          const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
          const fading = before.opacity < 0.98;
          if (!moved && !fading) continue;
          if (!nearViewport(now) && !nearViewport(before.rect)) continue;
          const from: Keyframe = { transform: `translate(${dx}px, ${dy}px)` };
          const to: Keyframe = { transform: 'none' };
          if (fading) {
            from.opacity = before.opacity;
            to.opacity = 1;
          }
          el.animate([from, to], { duration: 620, easing: springSoft(), id: 'flip' });
        }

        for (const [key, snap] of previous) {
          if (
            !present.has(key) &&
            !snap.hidden &&
            snap.opacity > 0.05 &&
            nearViewport(snap.rect, 0)
          ) {
            ghost(snap);
          }
        }
      }

      // Newcomers: animate the ones on screen, reveal the rest on scroll.
      const animateNew = previous !== null || !introDone;
      let stagger = 0;
      for (const el of list) {
        if (REVEALED.has(el)) continue;
        const rect = el.getBoundingClientRect();
        if (nearViewport(rect, 40)) {
          observer?.unobserve(el);
          el.removeAttribute('data-reveal');
          REVEALED.add(el);
          if (animateNew) enter(el, Math.min(stagger++, 12) * (previous ? 22 : 45));
        } else {
          const io = ensureObserver();
          if (io) {
            el.setAttribute('data-reveal', 'pending');
            io.observe(el);
          } else {
            REVEALED.add(el);
          }
        }
      }
      if (list.length > 0) introDone = true;
    },
  };
}

/* ------------------------------ Shared element --------------------------- */

export function isOnScreen(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

export interface Flight {
  cancel: () => void;
}

/**
 * Fly a copy of an icon from `from` to `to` (both stay hidden meanwhile and
 * reappear when it lands). The copy lives on <body>, so it can outlive the
 * component that started it — e.g. flying back to a card after the detail
 * panel has unmounted.
 */
export function flyBetween(from: HTMLElement, to: HTMLElement, duration = 600): Flight | null {
  if (!canAnimate(from) || !isOnScreen(from) || !isOnScreen(to)) return null;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  // Clone the larger icon so the copy stays crisp while scaled.
  const big = b.width >= a.width ? to : from;
  const base = big === to ? b : a;
  const flyer = big.cloneNode(true) as HTMLElement;
  flyer.classList.add('motion-flyer');
  flyer.setAttribute('aria-hidden', 'true');
  Object.assign(flyer.style, {
    position: 'fixed',
    left: `${base.left}px`,
    top: `${base.top}px`,
    width: `${base.width}px`,
    height: `${base.height}px`,
    margin: '0',
    transformOrigin: '0 0',
    pointerEvents: 'none',
    zIndex: '1000',
    visibility: 'visible',
  });
  const place = (r: DOMRect) =>
    `translate(${r.left - base.left}px, ${r.top - base.top}px) scale(${r.width / base.width})`;

  document.body.appendChild(flyer);
  from.style.visibility = 'hidden';
  to.style.visibility = 'hidden';
  const animation = flyer.animate([{ transform: place(a) }, { transform: place(b) }], {
    duration,
    easing: springSoft(),
    fill: 'forwards',
  });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    from.style.visibility = '';
    to.style.visibility = '';
    flyer.remove();
  };
  animation.finished.then(finish, finish);
  return {
    cancel() {
      animation.cancel();
      finish();
    },
  };
}

/* ------------------------------ Panels/sheets ---------------------------- */

function offscreenTransform(sheet: boolean): string {
  return sheet ? 'translateY(100%)' : 'translateX(100%)';
}

export function isSheetLayout(): boolean {
  try {
    return window.matchMedia('(max-width: 699px)').matches;
  } catch {
    return false;
  }
}

/** Slide a panel in from the edge (or up from the bottom on phones). */
export function slideIn(panel: HTMLElement, backdrop: HTMLElement | null): void {
  if (!canAnimate(panel)) return;
  const sheet = isSheetLayout();
  panel.animate([{ transform: offscreenTransform(sheet) }, { transform: 'none' }], {
    duration: sheet ? 560 : 600,
    easing: springSoft(),
    id: 'panel',
  });
  backdrop?.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 320,
    easing: 'ease-out',
    id: 'panel',
  });
}

/**
 * Slide a panel out from wherever it currently is (so closing mid-open
 * reverses smoothly). Resolves when it is gone; immediately under reduced
 * motion.
 */
export function slideOut(panel: HTMLElement, backdrop: HTMLElement | null): Promise<void> {
  if (!canAnimate(panel)) return Promise.resolve();
  const sheet = isSheetLayout();
  const currentTransform = getComputedStyle(panel).transform;
  const currentOpacity = backdrop ? Number(getComputedStyle(backdrop).opacity) : 1;
  cancelById(panel, 'panel');
  if (backdrop) cancelById(backdrop, 'panel');
  const out = panel.animate(
    [
      { transform: currentTransform === 'none' ? 'none' : currentTransform },
      { transform: offscreenTransform(sheet) },
    ],
    { duration: 300, easing: easeIn(), fill: 'forwards', id: 'panel-out' },
  );
  backdrop?.animate([{ opacity: currentOpacity }, { opacity: 0 }], {
    duration: 280,
    easing: 'ease-in',
    fill: 'forwards',
    id: 'panel-out',
  });
  return out.finished.then(
    () => undefined,
    () => undefined,
  );
}

/** Content swap (e.g. Apps <-> Updates): slide in from the travel direction. */
export function slideContent(el: HTMLElement | null, direction: 1 | -1): void {
  if (!canAnimate(el)) return;
  cancelById(el, 'content');
  el.animate(
    [
      { opacity: 0, transform: `translateX(${direction * 32}px)` },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 480, easing: springSoft(), id: 'content' },
  );
}

/** Generic pop-in for small surfaces (toasts, result panels). */
export function popIn(el: HTMLElement | null, from = 'translateY(16px) scale(0.96)'): void {
  if (!canAnimate(el)) return;
  el.animate(
    [
      { opacity: 0, transform: from },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 460, easing: spring(), id: 'pop' },
  );
}

/* ---------------------------------- Theme -------------------------------- */

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

/* ------------------------------- Watch star ------------------------------ */

/** Springy pop for the watch star; a softer dip when unwatching. */
export function starPop(el: Element, watching: boolean): void {
  if (!canAnimate(el as HTMLElement)) return;
  cancelById(el, 'star');
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
        id: 'star',
      },
    );
  } else {
    el.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.72)', opacity: 0.55, offset: 0.45 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 260, easing: 'ease-out', id: 'star' },
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
  if (!canAnimate(anchor)) return;
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

import { useCallback, useLayoutEffect, useRef } from 'preact/hooks';
import { easeIn, prefersReducedMotion, spring } from '../lib/motion.ts';
import { CloseIcon } from './Icons.tsx';

export interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

/**
 * A short confirmation that springs up from the bottom, counts down with a
 * thin progress bar (paused while hovered or focused), and sinks away when
 * it times out or is dismissed. The countdown is the bar's own animation, so
 * timer and visuals can never disagree.
 */
export function Toast({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const countdown = useRef<Animation | null>(null);
  const leaving = useRef(false);

  const leave = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function') {
      onDone();
      return;
    }
    el.animate(
      [
        { opacity: 1, transform: 'translate(-50%, 0)' },
        { opacity: 0, transform: 'translate(-50%, 14px) scale(0.96)' },
      ],
      { duration: 200, easing: easeIn(), fill: 'forwards' },
    ).finished.then(onDone, onDone);
  }, [onDone]);

  useLayoutEffect(() => {
    const el = ref.current;
    const bar = barRef.current;
    if (el && typeof el.animate === 'function' && !prefersReducedMotion()) {
      el.animate(
        [
          { opacity: 0, transform: 'translate(-50%, 22px) scale(0.94)' },
          { opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
        ],
        { duration: 480, easing: spring() },
      );
    }
    const duration = toast.action ? 7000 : 5000;
    if (bar && typeof bar.animate === 'function') {
      const animation = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
        duration,
        fill: 'forwards',
      });
      countdown.current = animation;
      animation.finished.then(leave, () => {});
      return () => animation.cancel();
    }
    const timer = setTimeout(leave, duration);
    return () => clearTimeout(timer);
  }, [toast, leave]);

  const pause = () => countdown.current?.pause();
  const resume = () => {
    if (!leaving.current) countdown.current?.play();
  };

  return (
    <div
      class="toast"
      role="status"
      ref={ref}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusIn={pause}
      onFocusOut={resume}
    >
      <span class="toast__text">{toast.text}</span>
      {toast.action ? (
        <button
          type="button"
          class="toast__action"
          onClick={() => {
            toast.action?.run();
            leave();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        class="icon-button icon-button--small"
        aria-label="Dismiss"
        onClick={leave}
      >
        <CloseIcon size={14} />
      </button>
      <span class="toast__timer" ref={barRef} aria-hidden="true" />
    </div>
  );
}

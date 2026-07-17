import { useEffect, useRef, useState } from 'preact/hooks';
import { StarIcon } from './Icons.tsx';

interface WatchButtonProps {
  appName: string;
  watched: boolean;
  onToggle: () => void;
}

const PARTICLES = [0, 48, 96, 144, 192, 240, 288] as const;
const BURST_LIFETIME_MS = 700;

/**
 * The watch/favorite star. Watching fires a small gold spark burst tied to
 * the control; unwatching gets a quieter shrink. The burst only ever starts
 * from a real click (never from state initialization), rapid re-clicks
 * replace the previous burst (no DOM/timer leaks), and reduced-motion users
 * see the state change without fireworks.
 */
export function WatchButton({ appName, watched, onToggle }: WatchButtonProps) {
  // 0 = no animation yet; odd = watch burst; even = unwatch dip.
  const [animation, setAnimation] = useState<{ kind: 'add' | 'remove'; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleClick() {
    const adding = !watched;
    setAnimation((previous) => ({
      kind: adding ? 'add' : 'remove',
      key: (previous?.key ?? 0) + 1,
    }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnimation(null), BURST_LIFETIME_MS);
    onToggle();
  }

  return (
    <button
      type="button"
      class={`watch-button${watched ? ' is-watched' : ''}`}
      aria-pressed={watched}
      aria-label={watched ? `Stop watching ${appName}` : `Watch ${appName}`}
      title={watched ? 'Remove from your watchlist' : 'Add to your watchlist'}
      onClick={handleClick}
    >
      <span
        key={animation?.key ?? 'idle'}
        class={`watch-button__star${
          animation ? (animation.kind === 'add' ? ' watch-pop' : ' watch-dip') : ''
        }`}
      >
        <StarIcon size={17} filled={watched} />
      </span>
      {animation?.kind === 'add' ? (
        <span class="watch-burst" key={`burst-${animation.key}`} aria-hidden="true">
          {PARTICLES.map((angle, i) => (
            <span
              class="watch-burst__spark"
              key={angle}
              style={{ '--angle': `${angle + (i % 2) * 14}deg`, '--dist': `${16 + (i % 3) * 5}px` }}
            />
          ))}
          <span class="watch-burst__ring" />
        </span>
      ) : null}
    </button>
  );
}

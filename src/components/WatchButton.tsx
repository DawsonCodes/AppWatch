import { useRef } from 'preact/hooks';
import { sparkBurst, starPop } from '../lib/motion.ts';
import { StarIcon } from './Icons.tsx';

interface WatchButtonProps {
  appName: string;
  watched: boolean;
  onToggle: () => void;
  /** Show a text label next to the star (used in the detail panel). */
  labelled?: boolean;
}

/**
 * The watch/favorite star. Watching makes the star spring up and throws a
 * small gold firework from it (square pixels in the MS Paint theme);
 * unwatching gets a quieter dip. Effects only ever start from a real click,
 * never from state loaded from storage, and clean themselves up.
 */
export function WatchButton({ appName, watched, onToggle, labelled = false }: WatchButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const starRef = useRef<HTMLSpanElement>(null);

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    const adding = !watched;
    onToggle();
    if (starRef.current) starPop(starRef.current, adding);
    if (adding && buttonRef.current) sparkBurst(buttonRef.current);
  }

  return (
    <button
      type="button"
      ref={buttonRef}
      class={`watch${watched ? ' is-watched' : ''}${labelled ? ' watch--labelled' : ''}`}
      aria-pressed={watched}
      aria-label={labelled ? undefined : watched ? `Stop watching ${appName}` : `Watch ${appName}`}
      title={watched ? 'Remove from your watchlist' : 'Add to your watchlist'}
      onClick={handleClick}
    >
      <span class="watch__star" ref={starRef}>
        <StarIcon size={labelled ? 16 : 18} filled={watched} />
      </span>
      {labelled ? <span>{watched ? 'Watching' : 'Watch'}</span> : null}
    </button>
  );
}

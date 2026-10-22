import { useRef } from 'preact/hooks';
import { starPop } from '../lib/motion.ts';
import { StarIcon } from './Icons.tsx';

interface WatchButtonProps {
  appName: string;
  watched: boolean;
  onToggle: () => void;
  /** Show a text label next to the star (used on the app page). */
  labelled?: boolean;
}

/** Star button for the personal watchlist (kept in this browser only). */
export function WatchButton({ appName, watched, onToggle, labelled = false }: WatchButtonProps) {
  const starRef = useRef<HTMLSpanElement>(null);

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    if (starRef.current) starPop(starRef.current, !watched);
    onToggle();
  }

  return (
    <button
      type="button"
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

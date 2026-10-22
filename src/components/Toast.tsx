import { useEffect, useRef } from 'preact/hooks';
import { CloseIcon } from './Icons.tsx';

export interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

/**
 * A short message at the bottom of the screen. It goes away on its own after
 * a few seconds (the timer pauses while it's hovered or focused) or when
 * dismissed.
 */
export function Toast({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const duration = toast.action ? 7000 : 4500;

  const start = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(onDone, duration);
  };
  const pause = () => clearTimeout(timer.current);

  useEffect(() => {
    start();
    return pause;
  }, [toast.id]);

  return (
    <div
      class="toast"
      role="status"
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocusIn={pause}
      onFocusOut={start}
    >
      <span class="toast__text">{toast.text}</span>
      {toast.action ? (
        <button
          type="button"
          class="toast__action"
          onClick={() => {
            toast.action?.run();
            onDone();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        class="icon-button icon-button--small"
        aria-label="Dismiss"
        onClick={onDone}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

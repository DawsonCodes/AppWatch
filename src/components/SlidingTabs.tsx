import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { prefersReducedMotion } from '../lib/motion.ts';

export interface TabItem<T extends string> {
  value: T;
  label: ComponentChildren;
  count?: number;
  icon?: ComponentChildren;
  /** Accessible name when the visible label is not enough. */
  ariaLabel?: string;
}

interface SlidingTabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the whole group. */
  label: string;
  variant: 'pill' | 'underline';
  /** tablist switches views/panels; radiogroup picks a filter value. */
  role?: 'tablist' | 'radiogroup';
  /** id of the region a tablist controls. */
  controls?: string;
  class?: string;
}

/**
 * A row of mutually exclusive options with an indicator that glides to the
 * selected one (a filled pill, or an underline for scrollable tab rows).
 * Keyboard: arrow keys, Home and End move and select (roving tabindex).
 */
export function SlidingTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  variant,
  role = 'tablist',
  controls,
  class: className = '',
}: SlidingTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);

  const position = useCallback(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    const active = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !indicator || !active) return;
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    indicator.style.width = `${active.offsetWidth}px`;
    if (variant === 'pill') {
      indicator.style.height = `${active.offsetHeight}px`;
      indicator.style.top = `${active.offsetTop}px`;
    }
  }, [variant]);

  useLayoutEffect(() => {
    position();
  }, [position, value, items]);

  // Re-measure when fonts load or the row resizes; enable gliding after the
  // first measurement so the indicator doesn't fly in from the left on load.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(position) : null;
    observer?.observe(list);
    document.fonts?.ready.then(position).catch(() => {});
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [position]);

  // Keep the selected tab in view inside horizontally scrolling rows.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [value]);

  function onKeyDown(event: KeyboardEvent) {
    const index = items.findIndex((item) => item.value === value);
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.value);
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-value="${target.value}"]`)?.focus(),
    );
  }

  const itemRole = role === 'tablist' ? 'tab' : 'radio';

  return (
    <div
      class={`sliding sliding--${variant}${ready ? ' is-ready' : ''} ${className}`}
      role={role}
      aria-label={label}
      ref={listRef}
      onKeyDown={onKeyDown}
    >
      <span class="sliding__indicator" ref={indicatorRef} aria-hidden="true" />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            type="button"
            key={item.value}
            role={itemRole}
            class="sliding__item"
            data-active={active ? 'true' : 'false'}
            data-value={item.value}
            aria-selected={role === 'tablist' ? active : undefined}
            aria-checked={role === 'radiogroup' ? active : undefined}
            aria-controls={role === 'tablist' ? controls : undefined}
            aria-label={item.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => !active && onChange(item.value)}
          >
            {item.icon}
            <span class="sliding__label">{item.label}</span>
            {item.count !== undefined ? <span class="sliding__count">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

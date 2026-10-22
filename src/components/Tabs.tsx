import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface TabItem<T extends string> {
  value: T;
  label: ComponentChildren;
  count?: number;
  icon?: ComponentChildren;
  /** Accessible name when the visible label is not enough. */
  ariaLabel?: string;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the whole group. */
  label: string;
  /** "pill" for small segmented controls, "chips" for a wrapping row of filter chips. */
  variant: 'pill' | 'chips';
  /** tablist switches views or panels; radiogroup picks a filter value. */
  role?: 'tablist' | 'radiogroup';
  /** id of the region a tablist controls. */
  controls?: string;
  class?: string;
}

/**
 * A row of mutually exclusive options. The selected one is simply styled as
 * selected; nothing is measured or animated, so it can't drift or lag.
 * Keyboard: arrow keys, Home and End move and select (roving tabindex).
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  variant,
  role = 'tablist',
  controls,
  class: className = '',
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected tab visible in a horizontally scrolling row, without
  // scrolling the page itself.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[data-active="true"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const left =
      active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    const right = left + active.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left - 16;
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth + 16;
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
    listRef.current
      ?.querySelector<HTMLElement>(`[data-value="${CSS.escape(target.value)}"]`)
      ?.focus();
  }

  const itemRole = role === 'tablist' ? 'tab' : 'radio';

  return (
    <div
      class={`tabs tabs--${variant}${className ? ` ${className}` : ''}`}
      role={role}
      aria-label={label}
      ref={listRef}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            type="button"
            key={item.value}
            role={itemRole}
            class="tabs__item"
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
            <span class="tabs__label">{item.label}</span>
            {item.count !== undefined ? <span class="tabs__count">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

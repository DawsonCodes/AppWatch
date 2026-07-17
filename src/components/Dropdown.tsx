import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useId, useRef, useState } from 'preact/hooks';
import { ChevronDownIcon } from './Icons.tsx';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface DropdownProps<T extends string> {
  /** Accessible name for the whole control, e.g. "Sort apps" or "Theme". */
  label: string;
  options: readonly DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What the closed button shows. Defaults to the selected option's label. */
  buttonContent?: ComponentChildren;
  align?: 'start' | 'end';
  buttonClass?: string;
}

/**
 * Accessible select-style dropdown (button + listbox popup) with an animated
 * chevron and menu. Built by hand because native <select> arrows cannot be
 * animated honestly; keyboard behavior follows the WAI-ARIA listbox pattern:
 * Enter/Space/ArrowDown open, arrows move, Home/End jump, Escape closes and
 * restores focus, Tab or outside click closes.
 */
export function Dropdown<T extends string>({
  label,
  options,
  value,
  onChange,
  buttonContent,
  align = 'start',
  buttonClass = '',
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const selected = options.find((option) => option.value === value);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Close when clicking/tapping outside or when focus leaves the control.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  // Focus the selected option when the menu opens.
  useEffect(() => {
    if (!open) return;
    const target =
      listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      listRef.current?.querySelector<HTMLElement>('[role="option"]');
    target?.focus();
  }, [open]);

  function optionElements(): HTMLElement[] {
    return Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
  }

  function onButtonKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent) {
    const items = optionElements();
    const index = items.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'ArrowDown':
        event.preventDefault();
        items[Math.min(index + 1, items.length - 1)]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        items[Math.max(index - 1, 0)]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case 'Tab':
        close(false);
        break;
    }
  }

  return (
    <div class={`dropdown${open ? ' dropdown--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        class={`dropdown__button ${buttonClass}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onButtonKeyDown}
      >
        <span class="dropdown__current">{buttonContent ?? selected?.label}</span>
        <ChevronDownIcon size={14} />
      </button>
      <div
        class={`dropdown__menu dropdown__menu--${align}`}
        id={menuId}
        role="listbox"
        aria-label={label}
        ref={listRef}
        onKeyDown={onMenuKeyDown}
      >
        {options.map((option) => (
          <button
            type="button"
            key={option.value}
            role="option"
            aria-selected={option.value === value}
            class="dropdown__option"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onChange(option.value);
              close(true);
            }}
          >
            <span class="dropdown__option-label">{option.label}</span>
            {option.description ? (
              <span class="dropdown__option-desc">{option.description}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

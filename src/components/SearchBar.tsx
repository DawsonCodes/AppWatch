import type { Ref } from 'preact';
import { CloseIcon, SearchIcon } from './Icons.tsx';

interface SearchBarProps {
  value: string;
  onInput: (value: string) => void;
  onSubmit: () => void;
  inputRef: Ref<HTMLInputElement>;
}

/**
 * The one search field: filters tracked apps as you type, and Enter looks
 * further on the App Store. Accepts names, store links, Apple IDs and Play
 * package names. Press "/" anywhere to jump here.
 */
export function SearchBar({ value, onInput, onSubmit, inputRef }: SearchBarProps) {
  return (
    <form
      class={`search${value ? ' has-value' : ''}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label class="visually-hidden" for="app-search">
        Search apps by name, store link, Apple ID or package name
      </label>
      <SearchIcon size={18} class="search__icon" />
      <input
        id="app-search"
        ref={inputRef}
        class="search__input"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellcheck={false}
        placeholder="Search apps, store links or IDs…"
        value={value}
        onInput={(event) => onInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onInput('');
          }
        }}
      />
      <kbd class="search__kbd" aria-hidden="true">
        /
      </kbd>
      <button
        type="button"
        class="search__clear"
        aria-label="Clear search"
        tabIndex={value ? 0 : -1}
        onClick={() => {
          onInput('');
          const input = (inputRef as { current: HTMLInputElement | null }).current;
          input?.focus();
        }}
      >
        <CloseIcon size={14} />
      </button>
    </form>
  );
}

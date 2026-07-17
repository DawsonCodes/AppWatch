import type { RefObject } from 'preact';
import type { FilterState, SortKey } from '../lib/filtering.ts';
import { hasActiveFilters } from '../lib/filtering.ts';
import { Dropdown } from './Dropdown.tsx';
import { SearchIcon } from './Icons.tsx';

interface ToolbarProps {
  filters: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  onClear: () => void;
  onSubmitSearch: () => void;
  searchRef: RefObject<HTMLInputElement>;
  resultCount: number;
  totalCount: number;
}

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All stores' },
  { value: 'apple', label: 'App Store' },
  { value: 'google', label: 'Google Play' },
] as const;

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'Newest update' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'platform', label: 'Platform' },
];

export function Toolbar({
  filters,
  onChange,
  onClear,
  onSubmitSearch,
  searchRef,
  resultCount,
  totalCount,
}: ToolbarProps) {
  const sortLabel = SORT_OPTIONS.find((option) => option.value === filters.sort)?.label;

  return (
    <section class="toolbar" aria-label="Search, filters and sorting">
      <form
        class="search-field"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitSearch();
        }}
      >
        <SearchIcon size={16} />
        <label class="visually-hidden" for="app-search">
          Search apps — by name, developer, store link, Apple ID, or package name
        </label>
        <input
          id="app-search"
          ref={searchRef}
          type="search"
          placeholder="Search apps, or paste a store link…"
          value={filters.query}
          onInput={(event) => onChange({ query: (event.target as HTMLInputElement).value })}
          autocomplete="off"
          spellcheck={false}
        />
      </form>

      <div class="toolbar__filters">
        <div class="toolbar__group" role="group" aria-label="Filter by store">
          {PLATFORM_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              class="segment"
              aria-pressed={filters.platform === option.value}
              onClick={() => onChange({ platform: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div class="toolbar__group" role="group" aria-label="Quick filters">
          <button
            type="button"
            class="segment"
            aria-pressed={filters.recentOnly}
            onClick={() => onChange({ recentOnly: !filters.recentOnly })}
          >
            Updated recently
          </button>
          <button
            type="button"
            class="segment"
            aria-pressed={filters.watchedOnly}
            onClick={() => onChange({ watchedOnly: !filters.watchedOnly })}
          >
            Watched
          </button>
        </div>

        <Dropdown
          label="Sort apps"
          options={SORT_OPTIONS}
          value={filters.sort}
          onChange={(sort) => onChange({ sort })}
          buttonContent={`Sort: ${sortLabel ?? ''}`}
        />

        {hasActiveFilters(filters) ? (
          <button type="button" class="toolbar__clear" onClick={onClear}>
            Clear filters
          </button>
        ) : null}

        <p class="toolbar__count" role="status" aria-live="polite">
          {resultCount} of {totalCount} apps
        </p>
      </div>
    </section>
  );
}

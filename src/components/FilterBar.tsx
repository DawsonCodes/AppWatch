import type { FilterState, SortKey } from '../lib/filtering.ts';
import { hasActiveFilters } from '../lib/filtering.ts';

interface FilterBarProps {
  filters: FilterState;
  onChange: (next: Partial<FilterState>) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All stores' },
  { value: 'apple', label: 'App Store' },
  { value: 'google', label: 'Google Play' },
] as const;

export function FilterBar({ filters, onChange, onClear, resultCount, totalCount }: FilterBarProps) {
  return (
    <section class="filter-bar" aria-label="Filters and sorting">
      <div class="filter-bar__group" role="group" aria-label="Filter by store">
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

      <div class="filter-bar__group" role="group" aria-label="Quick filters">
        <button
          type="button"
          class="segment"
          aria-pressed={filters.recentOnly}
          onClick={() => onChange({ recentOnly: !filters.recentOnly })}
        >
          Recently updated
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

      <label class="filter-bar__sort">
        <span>Sort by</span>
        <select
          value={filters.sort}
          onChange={(event) =>
            onChange({ sort: (event.target as HTMLSelectElement).value as SortKey })
          }
        >
          <option value="updated">Newest update</option>
          <option value="name">Name (A–Z)</option>
          <option value="platform">Platform</option>
        </select>
      </label>

      {hasActiveFilters(filters) ? (
        <button type="button" class="filter-bar__clear" onClick={onClear}>
          Clear filters
        </button>
      ) : null}

      <p class="filter-bar__count" role="status" aria-live="polite">
        Showing {resultCount} of {totalCount} apps
      </p>
    </section>
  );
}

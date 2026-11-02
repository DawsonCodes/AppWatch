import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Cadence } from '../lib/cadence.ts';
import { describeDays } from '../lib/cadence.ts';
import { densityProfile } from '../shared/forecast.ts';

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const shortDate = dateFormat;
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** Track an element's content width (charts are drawn at real pixel size). */
function useWidth(): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

interface Tip {
  x: number;
  y: number;
  value: ComponentChildren;
  label: ComponentChildren;
}

/** Hover/focus readout: value first (strong), label second. Clamped inside the chart. */
function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const w = ref.current.offsetWidth;
    setLeft(Math.min(Math.max(tip.x - w / 2, 0), Math.max(0, width - w)));
  }, [tip, width]);
  if (!tip) return null;
  return (
    <div class="chart-tip" ref={ref} style={{ left: `${left}px`, top: `${tip.y}px` }} role="status">
      <strong class="chart-tip__value">{tip.value}</strong>
      <span class="chart-tip__label">{tip.label}</span>
    </div>
  );
}

/**
 * Keyboard + pointer selection shared by both charts: one tab stop, arrow
 * keys move between marks, Escape clears; the pointer snaps to the nearest.
 */
function useActive(count: number) {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (active !== null && active >= count) setActive(null);
  }, [count, active]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (count === 0) return;
    let next: number | null;
    if (event.key === 'ArrowRight')
      next = active === null ? count - 1 : Math.min(count - 1, active + 1);
    else if (event.key === 'ArrowLeft')
      next = active === null ? count - 1 : Math.max(0, active - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else if (event.key === 'Escape') next = null;
    else return;
    event.preventDefault();
    setActive(next);
  };
  return {
    active,
    setActive,
    focusProps: {
      tabIndex: 0,
      onKeyDown,
      onFocus: () => setActive((a) => a ?? count - 1),
      onBlur: () => setActive(null),
    },
  };
}

/* ------------------------------ Forecast bar ------------------------------ */

const BAR_H = 104;
const HILL_TOP = 12;
const TRACK_Y = 64;
const LABEL_Y = 86;

interface BarLabel {
  x: number;
  text: string;
  priority: number;
  anchor?: 'start' | 'middle' | 'end';
  strong?: boolean;
}

/** Drop labels that would overlap a more important one (approximate text widths). */
function placeLabels(labels: BarLabel[], width: number): BarLabel[] {
  const placed: { left: number; right: number; label: BarLabel }[] = [];
  for (const label of [...labels].sort((a, b) => b.priority - a.priority)) {
    const w = label.text.length * 6.4 + 10;
    let anchor = label.anchor ?? 'middle';
    let left = anchor === 'start' ? label.x : anchor === 'end' ? label.x - w : label.x - w / 2;
    if (left < 0) {
      anchor = 'start';
      left = Math.max(0, label.x - 2);
    }
    if (left + w > width) {
      anchor = 'end';
      left = Math.min(width, label.x + 2) - w;
    }
    const right = left + w;
    if (placed.some((p) => left < p.right && right > p.left)) continue;
    placed.push({
      left,
      right,
      label: { ...label, anchor, x: Math.min(Math.max(label.x, 0), width) },
    });
  }
  return placed.map((p) => p.label);
}

/** Gaussian smoothing over neighbouring samples (sigma in samples; < 0.5 leaves it as is). */
function smooth(values: readonly number[], sigma: number): number[] {
  if (sigma < 0.5) return [...values];
  const reach = Math.ceil(sigma * 2.5);
  const kernel = Array.from({ length: reach * 2 + 1 }, (_, i) =>
    Math.exp(-0.5 * ((i - reach) / sigma) ** 2),
  );
  return values.map((_, i) => {
    let sum = 0;
    let weight = 0;
    for (let k = -reach; k <= reach; k++) {
      const v = values[i + k];
      if (v === undefined) continue;
      sum += v * kernel[k + reach]!;
      weight += kernel[k + reach]!;
    }
    return weight > 0 ? sum / weight : 0;
  });
}

/**
 * The forecast at a glance: the last update, today, and how likely the next
 * update is on each day ahead (the hill), with the expected window shaded
 * and the expected day marked.
 */
export function ForecastBar({ cadence, now }: { cadence: Cadence; now: Date }) {
  const [ref, width] = useWidth();
  const nowMs = now.getTime();
  const last = cadence.last?.time ?? nowMs;
  const next = cadence.next;
  const end = useMemo(() => {
    const target = next
      ? Math.max(next.to, next.likely)
      : last + Math.max((cadence.typicalDays ?? 7) * DAY, nowMs - last);
    const span = Math.max(target, nowMs) - last;
    return last + span * 1.1 + DAY / 2;
  }, [next, last, nowMs, cadence.typicalDays]);

  const left = 6;
  const right = Math.max(left + 1, width - 6);
  const x = (t: number) => left + ((t - last) / Math.max(1, end - last)) * (right - left);

  const hill = useMemo(() => {
    if (!cadence.distribution || !next || width <= 0) return null;
    const fromDays = (nowMs - last) / DAY;
    const toDays = (end - last) / DAY;
    if (toDays <= fromDays) return null;
    const count = Math.max(24, Math.min(240, Math.round((right - x(nowMs)) / 3)));
    // Over long spans, smooth out day-to-day weekday spikes so the shape reads at a glance.
    const smoothDays = Math.min(3.5, (toDays - fromDays) / 25);
    const profile = smooth(
      densityProfile(cadence.distribution, fromDays, toDays, count),
      (smoothDays / (toDays - fromDays)) * count,
    );
    const peak = Math.max(...profile, 1e-12);
    const x0 = x(nowMs);
    const x1 = right;
    const stepX = (x1 - x0) / count;
    let d = `M${x0},${TRACK_Y}`;
    profile.forEach((v, i) => {
      const y = TRACK_Y - (v / peak) * (TRACK_Y - HILL_TOP);
      d += `L${x0 + stepX * (i + 0.5)},${y}`;
    });
    d += `L${x1},${TRACK_Y}Z`;
    const likelyIndex = Math.min(count - 1, Math.max(0, Math.floor((x(next.likely) - x0) / stepX)));
    const likelyY = TRACK_Y - ((profile[likelyIndex] ?? 0) / peak) * (TRACK_Y - HILL_TOP);
    return { d, likelyY };
    // x depends on width, last and end only
  }, [cadence.distribution, next, width, nowMs, last, end]);

  const clipId = useMemo(() => `win-${Math.random().toString(36).slice(2, 9)}`, []);

  const labels: BarLabel[] = [
    { x: x(last), text: shortDate.format(last), priority: 1, anchor: 'start' },
    { x: x(nowMs), text: 'Today', priority: 3, strong: true },
  ];
  if (next) {
    if (next.from - nowMs > DAY / 2) {
      labels.push({ x: x(next.from), text: shortDate.format(next.from), priority: 2 });
    }
    labels.push({ x: x(next.to), text: shortDate.format(next.to), priority: 2 });
  } else if (cadence.typicalDays) {
    const usual = last + cadence.typicalDays * DAY;
    if (usual < end) labels.push({ x: x(usual), text: 'Usual gap', priority: 2 });
  }

  const describe = next
    ? `Last update ${longDate.format(last)}. Next update expected around ${longDate.format(next.likely)}, likely between ${longDate.format(next.from)} and ${longDate.format(next.to)}.`
    : `Last update ${longDate.format(last)}.`;

  return (
    <div class="forecast-bar" ref={ref} role="img" aria-label={describe}>
      {width > 0 ? (
        <svg width={width} height={BAR_H} aria-hidden="true">
          {next ? (
            <defs>
              <clipPath id={clipId}>
                <rect
                  x={x(next.from)}
                  y={0}
                  width={Math.max(2, x(next.to) - x(next.from))}
                  height={TRACK_Y + 1}
                />
              </clipPath>
            </defs>
          ) : null}
          <line class="forecast-bar__track" x1={left} x2={right} y1={TRACK_Y} y2={TRACK_Y} />
          <line class="forecast-bar__waited" x1={x(last)} x2={x(nowMs)} y1={TRACK_Y} y2={TRACK_Y} />
          {hill ? (
            <>
              <path class="forecast-bar__hill" d={hill.d} />
              <path
                class="forecast-bar__hill forecast-bar__hill--window"
                d={hill.d}
                clip-path={`url(#${clipId})`}
              />
            </>
          ) : null}
          {next ? (
            <>
              <line
                class="forecast-bar__likely"
                x1={x(next.likely)}
                x2={x(next.likely)}
                y1={(hill?.likelyY ?? HILL_TOP) - 2}
                y2={TRACK_Y}
              />
              <circle class="forecast-bar__likely-dot" cx={x(next.likely)} cy={TRACK_Y} r={5} />
            </>
          ) : null}
          {!next && cadence.typicalDays ? (
            <line
              class="forecast-bar__usual"
              x1={x(last + cadence.typicalDays * DAY)}
              x2={x(last + cadence.typicalDays * DAY)}
              y1={TRACK_Y - 10}
              y2={TRACK_Y + 6}
            />
          ) : null}
          <line
            class="forecast-bar__today"
            x1={x(nowMs)}
            x2={x(nowMs)}
            y1={TRACK_Y - 12}
            y2={TRACK_Y + 6}
          />
          <circle class="forecast-bar__last" cx={x(last)} cy={TRACK_Y} r={4} />
          {placeLabels(labels, width).map((label) => (
            <text
              key={label.text + label.priority}
              class={`forecast-bar__label${label.strong ? ' is-strong' : ''}`}
              x={label.x}
              y={LABEL_Y}
              text-anchor={label.anchor ?? 'middle'}
            >
              {label.text}
            </text>
          ))}
        </svg>
      ) : (
        <div style={{ height: `${BAR_H}px` }} />
      )}
    </div>
  );
}

/* -------------------------------- Gap columns ------------------------------ */

const GAP_H = 150;
const GAP_TOP = 18;
const GAP_AXIS = 118;
const GAP_LEFT = 36;

function niceStep(max: number): number {
  for (const step of [1, 2, 3, 7, 14, 30, 60, 90, 180, 365]) {
    if (max / step <= 4) return step;
  }
  return 730;
}

function tickLabel(days: number): string {
  if (days === 0) return '0';
  if (days % 365 === 0) return `${days / 365}y`;
  if (days % 30 === 0 && days >= 30) return `${days / 30}mo`;
  if (days % 7 === 0 && days >= 14) return `${days / 7}w`;
  return `${days}d`;
}

/** A column with a 4px rounded top and a square base. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Days between consecutive releases (most recent 24), with the typical gap as
 * a reference line. One series; the title names it.
 */
export function GapColumns({ cadence }: { cadence: Cadence }) {
  const [ref, width] = useWidth();
  const gaps = cadence.gaps.slice(-24);
  const { active, setActive, focusProps } = useActive(gaps.length);
  const maxGap = Math.max(...gaps.map((g) => g.days), cadence.typicalDays ?? 0, 1);
  const step = niceStep(maxGap * 1.05);
  const top = Math.ceil((maxGap * 1.05) / step) * step;
  const plotRight = Math.max(GAP_LEFT + 1, width - 8);
  const slot = (plotRight - GAP_LEFT) / Math.max(1, gaps.length);
  const barW = Math.max(3, Math.min(24, slot - 2));
  const y = (days: number) => GAP_AXIS - (days / top) * (GAP_AXIS - GAP_TOP);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  const current = active !== null ? gaps[active] : undefined;
  const tip: Tip | null = current
    ? {
        x: GAP_LEFT + slot * (active! + 0.5),
        y: Math.max(0, y(current.days) - 52),
        value: describeDays(current.days),
        label: `${current.from.version ?? 'release'} → ${current.to.version ?? 'release'} · ${dateFormat.format(current.from.time)} – ${dateFormat.format(current.to.time)}`,
      }
    : null;

  function pick(clientX: number, rect: DOMRect) {
    const index = Math.floor((clientX - rect.left - GAP_LEFT) / slot);
    setActive(index >= 0 && index < gaps.length ? index : null);
  }

  const typicalY = cadence.typicalDays !== null ? y(cadence.typicalDays) : null;
  const first = gaps[0];
  const last = gaps[gaps.length - 1];

  return (
    <figure class="chart">
      <figcaption class="chart__title">
        Days between releases
        {cadence.typicalDays !== null ? (
          <span class="chart__legend">
            <span class="chart__legend-line" aria-hidden="true" />
            typical {describeDays(cadence.typicalDays).replace(/^about /, '~')}
          </span>
        ) : null}
      </figcaption>
      <div
        class="chart__plot"
        ref={ref}
        role="group"
        aria-label={`Days between the last ${gaps.length} releases. Use the arrow keys to step through them.`}
        {...focusProps}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 ? (
          <svg width={width} height={GAP_H} aria-hidden="true">
            {ticks.map((v) => (
              <g key={v}>
                <line class="chart__grid" x1={GAP_LEFT} x2={plotRight} y1={y(v)} y2={y(v)} />
                <text class="chart__tick" x={GAP_LEFT - 8} y={y(v) + 4} text-anchor="end">
                  {tickLabel(v)}
                </text>
              </g>
            ))}
            {gaps.map((gap, i) => {
              const h = Math.max(2, GAP_AXIS - y(gap.days));
              const bx = GAP_LEFT + slot * i + (slot - barW) / 2;
              return (
                <path
                  key={gap.to.time}
                  class={`chart__bar${i === active ? ' is-active' : ''}`}
                  d={columnPath(bx, GAP_AXIS - h, barW, h)}
                />
              );
            })}
            {typicalY !== null ? (
              <line class="chart__ref" x1={GAP_LEFT} x2={plotRight} y1={typicalY} y2={typicalY} />
            ) : null}
            <line class="chart__axis" x1={GAP_LEFT} x2={plotRight} y1={GAP_AXIS} y2={GAP_AXIS} />
            {first && last ? (
              <>
                <text class="chart__tick" x={GAP_LEFT} y={GAP_AXIS + 18}>
                  {dateFormat.format(first.to.time)}
                </text>
                <text class="chart__tick" x={plotRight} y={GAP_AXIS + 18} text-anchor="end">
                  {dateFormat.format(last.to.time)}
                </text>
              </>
            ) : null}
          </svg>
        ) : (
          <div style={{ height: `${GAP_H}px` }} />
        )}
        <Tooltip tip={tip} width={width} />
      </div>
    </figure>
  );
}

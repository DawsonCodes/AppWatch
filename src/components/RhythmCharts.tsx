import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Cadence } from '../lib/cadence.ts';
import { describeDays } from '../lib/cadence.ts';

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'short' });
const monthYearFormat = new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' });

/** Track an element's content width (charts are drawn at real pixel size). */
function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = (el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'function') {
      observer.current = new ResizeObserver(([entry]) => {
        if (entry) setWidth(Math.round(entry.contentRect.width));
      });
      observer.current.observe(el);
    }
  };
  useEffect(() => () => observer.current?.disconnect(), []);
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

/* ------------------------------ Release strip ----------------------------- */

const STRIP_H = 108;
const STRIP_DOT_Y = 54;
const STRIP_AXIS_Y = 82;

/**
 * Every release as a dot on a time axis, with today and the likely window for
 * the next release ahead of it. One series, so the title names it (no legend).
 */
export function ReleaseStrip({ cadence, now = new Date() }: { cadence: Cadence; now?: Date }) {
  const [ref, width] = useWidth();
  const nowMs = now.getTime();
  const { domain, shown } = useMemo(() => {
    const first = cadence.releases[0]?.time ?? nowMs - 30 * DAY;
    const start = Math.max(first, nowMs - 365 * DAY);
    const end = Math.max(nowMs, cadence.next?.to ?? nowMs);
    const pad = Math.max((end - start) * 0.04, DAY);
    return {
      domain: [start - pad, end + pad] as const,
      shown: cadence.releases.filter((r) => r.time >= start),
    };
  }, [cadence, nowMs]);
  const { active, setActive, focusProps } = useActive(shown.length);

  const plotLeft = 8;
  const plotRight = Math.max(plotLeft + 1, width - 8);
  const x = (t: number) =>
    plotLeft + ((t - domain[0]) / (domain[1] - domain[0])) * (plotRight - plotLeft);

  const ticks = useMemo(() => {
    const out: { t: number; label: string }[] = [];
    const d = new Date(domain[0]);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() + 1);
    let lastX = -Infinity;
    while (d.getTime() < domain[1]) {
      const t = d.getTime();
      const px = x(t);
      if (px - lastX >= 46) {
        const label =
          d.getMonth() === 0 || out.length === 0
            ? monthYearFormat.format(d)
            : monthFormat.format(d);
        out.push({ t, label });
        lastX = px;
      }
      d.setMonth(d.getMonth() + 1);
    }
    return out;
    // x depends on width/domain only
  }, [domain, width]);

  const nowX = x(nowMs);
  const likelyX = cadence.next ? x(cadence.next.likely) : null;
  const labelsCollide = likelyX !== null && Math.abs(likelyX - nowX) < 70;

  function pick(clientX: number, rect: DOMRect) {
    const px = clientX - rect.left;
    let best: number | null = null;
    let bestDist = 24;
    shown.forEach((r, i) => {
      const dist = Math.abs(x(r.time) - px);
      if (dist <= bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    setActive(best);
  }

  const current = active !== null ? shown[active] : undefined;
  const tip: Tip | null = current
    ? {
        x: x(current.time),
        y: 0,
        value: current.version ?? 'Store release',
        label: longDate.format(current.time),
      }
    : null;

  return (
    <figure class="chart">
      <figcaption class="chart__title">Release timeline</figcaption>
      <div
        class="chart__plot"
        ref={ref}
        aria-label={`Release timeline: ${shown.length} releases. Use the arrow keys to step through them.`}
        role="group"
        {...focusProps}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
      >
        {width > 0 ? (
          <svg width={width} height={STRIP_H} aria-hidden="true">
            <line
              class="chart__axis"
              x1={plotLeft}
              x2={plotRight}
              y1={STRIP_AXIS_Y}
              y2={STRIP_AXIS_Y}
            />
            {ticks.map((tick) => (
              <g key={tick.t}>
                <line
                  class="chart__axis"
                  x1={x(tick.t)}
                  x2={x(tick.t)}
                  y1={STRIP_AXIS_Y}
                  y2={STRIP_AXIS_Y + 4}
                />
                <text class="chart__tick" x={x(tick.t)} y={STRIP_AXIS_Y + 18} text-anchor="middle">
                  {tick.label}
                </text>
              </g>
            ))}
            {cadence.next ? (
              <g>
                <rect
                  class="chart__window"
                  x={x(cadence.next.from)}
                  y={28}
                  width={Math.max(2, x(cadence.next.to) - x(cadence.next.from))}
                  height={STRIP_AXIS_Y - 28}
                  rx={4}
                />
                <line class="chart__likely" x1={likelyX!} x2={likelyX!} y1={28} y2={STRIP_AXIS_Y} />
                <text
                  class="chart__note"
                  x={likelyX!}
                  y={20}
                  text-anchor={labelsCollide ? (likelyX! >= nowX ? 'start' : 'end') : 'middle'}
                >
                  Likely next
                </text>
              </g>
            ) : null}
            <line class="chart__today" x1={nowX} x2={nowX} y1={28} y2={STRIP_AXIS_Y} />
            <text
              class="chart__note"
              x={nowX}
              y={20}
              text-anchor={labelsCollide ? (likelyX! >= nowX ? 'end' : 'start') : 'middle'}
            >
              Today
            </text>
            {shown.map((r, i) => (
              <circle
                key={`${r.time}-${i}`}
                class={`chart__dot${i === active ? ' is-active' : ''}`}
                cx={x(r.time)}
                cy={STRIP_DOT_Y}
                r={i === active ? 6 : 4}
              />
            ))}
          </svg>
        ) : (
          <div style={{ height: `${STRIP_H}px` }} />
        )}
        <Tooltip tip={tip} width={width} />
      </div>
      {cadence.releases.length > shown.length ? (
        <p class="chart__foot">Showing the last 12 months.</p>
      ) : null}
    </figure>
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
      <figcaption class="chart__title">Days between releases</figcaption>
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
              <g>
                <line class="chart__ref" x1={GAP_LEFT} x2={plotRight} y1={typicalY} y2={typicalY} />
                <text class="chart__note" x={plotRight} y={typicalY - 6} text-anchor="end">
                  typical {describeDays(cadence.typicalDays!).replace(/^about /, '~')}
                </text>
              </g>
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

import { useState, type ReactNode } from "react";
import { Card } from "./ui";

// Small SVG chart kit used by the Dashboard. No chart library: every chart is a
// plain <svg> with a viewBox, so it scales with the card and stays themeable
// through the --viz-* custom properties defined in index.css (series hues are
// stepped per mode, not flipped).
//
// Conventions kept across all of them: thin marks (bars capped at 24px, 2px
// lines), hairline solid gridlines, a 2px surface gap between touching fills,
// a legend whenever there are two or more series, a hover/focus tooltip on
// every mark and a table view twin, so no value is reachable only by hovering.

export type Series = { key: string; label: string; color: string };
export type Datum = { label: string; values: number[] };

const W = 720; // viewBox width; the svg itself is width:100%
const PAD = { top: 16, right: 16, bottom: 30, left: 62 };
const BAR_MAX = 24; // never let a bar fill its band
const GAP = 2; // the surface gap between touching fills

type Tip = {
  x: number; // in viewBox units
  y: number;
  title: string;
  rows: { label: string; color: string; value: string }[];
};

function Tooltip({ tip, height }: { tip: Tip | null; height: number }) {
  if (!tip) return null;
  // Percent of the box, so it tracks the svg as it scales with the card.
  const left = Math.min(92, Math.max(8, (tip.x / W) * 100));
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg bg-neutral-900 px-2.5 py-1.5 shadow-lg ring-1 ring-black/10 dark:bg-neutral-800 dark:ring-white/10"
      style={{ left: `${left}%`, top: `${(tip.y / height) * 100}%` }}
    >
      <p className="mb-0.5 text-[11px] text-neutral-400">{tip.title}</p>
      {tip.rows.map((r) => (
        <p key={r.label} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
          <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
          <span className="font-semibold text-white">{r.value}</span>
          <span className="text-neutral-400">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

// Round y up to a readable axis top and hand back the tick values.
function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const mag = Math.pow(10, Math.floor(Math.log10(max / count)));
  const norm = max / count / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks.length === 1) ticks.push(step);
  return ticks;
}

// Bar with a 4px rounded data-end and a square foot at the baseline.
function barPath(x: number, y: number, w: number, h: number, round: boolean) {
  if (h <= 0) return "";
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

const axisText = "fill-[var(--viz-muted)] text-[11px]";

function Empty({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center text-sm text-neutral-400 dark:text-neutral-500"
      style={{ height }}
    >
      Sem dados no período
    </div>
  );
}

// Header + legend + the table view every chart ships with (the tooltip
// enhances, it never gates a value).
function ChartFrame({
  title,
  subtitle,
  series,
  data,
  format,
  children,
}: {
  title: string;
  subtitle?: string;
  series: Series[];
  data: Datum[];
  format: (v: number) => string;
  children: ReactNode;
}) {
  const [table, setTable] = useState(false);
  return (
    <Card className="viz p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">{subtitle}</p>
          )}
        </div>
        <button
          onClick={() => setTable((v) => !v)}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          {table ? "Gráfico" : "Tabela"}
        </button>
      </div>

      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <span
              key={s.key}
              className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"
            >
              <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3">
        {table ? (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-400 dark:text-neutral-500">
                <tr>
                  <th className="py-1 font-medium">Período</th>
                  {series.map((s) => (
                    <th key={s.key} className="py-1 text-right font-medium">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.map((d) => (
                  <tr key={d.label} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-1 text-neutral-600 dark:text-neutral-300">{d.label}</td>
                    {d.values.map((v, i) => (
                      <td
                        key={series[i]?.key ?? i}
                        className="py-1 text-right text-neutral-900 dark:text-neutral-100"
                      >
                        {format(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  );
}

// Vertical columns, one group or one stack per period. `threshold` draws a
// reference rule (the R$50k marks this app lives around).
export function ColumnChart({
  title,
  subtitle,
  data,
  series,
  format,
  tick,
  stacked = false,
  threshold,
  height = 250,
}: {
  title: string;
  subtitle?: string;
  data: Datum[];
  series: Series[];
  format: (v: number) => string;
  tick: (v: number) => string;
  stacked?: boolean;
  threshold?: { value: number; label: string };
  height?: number;
}) {
  const [tip, setTip] = useState<Tip | null>(null);
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const totals = data.map((d) =>
    stacked ? d.values.reduce((s, v) => s + v, 0) : Math.max(...d.values, 0),
  );
  const peak = Math.max(...totals, threshold?.value ?? 0, 0);
  const ticks = niceTicks(peak);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  const band = plotW / Math.max(data.length, 1);
  const barW = Math.min(BAR_MAX, (band * 0.62) / (stacked ? 1 : series.length));
  const groupW = stacked ? barW : barW * series.length + GAP * (series.length - 1);

  const rowsFor = (d: Datum) =>
    series.map((s, i) => ({ label: s.label, color: s.color, value: format(d.values[i] ?? 0) }));

  return (
    <ChartFrame title={title} subtitle={subtitle} series={series} data={data} format={format}>
      {!data.length ? (
        <Empty height={height} />
      ) : (
        <div className="relative" onPointerLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--viz-grid)"
                  strokeWidth="1"
                />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={axisText}>
                  {tick(t)}
                </text>
              </g>
            ))}

            {threshold && threshold.value <= top && (
              <g>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(threshold.value)}
                  y2={y(threshold.value)}
                  stroke="var(--viz-axis)"
                  strokeWidth="1.5"
                />
                <text
                  x={W - PAD.right}
                  y={y(threshold.value) - 5}
                  textAnchor="end"
                  className={axisText}
                >
                  {threshold.label}
                </text>
              </g>
            )}

            {data.map((d, di) => {
              const x0 = PAD.left + band * di + (band - groupW) / 2;
              let acc = 0;
              return (
                <g key={d.label}>
                  {series.map((s, si) => {
                    const v = d.values[si] ?? 0;
                    if (stacked) {
                      const h = Math.max(0, (v / top) * plotH - GAP);
                      const yy = y(acc + v) + GAP;
                      acc += v;
                      const topMost = series.slice(si + 1).every((_, k) => !d.values[si + 1 + k]);
                      return v > 0 ? (
                        <path
                          key={s.key}
                          d={barPath(x0, yy, barW, h, topMost)}
                          fill={s.color}
                          tabIndex={0}
                          onFocus={() => setTip({ x: x0 + barW / 2, y: y(acc), title: d.label, rows: rowsFor(d) })}
                          onBlur={() => setTip(null)}
                          onPointerEnter={() =>
                            setTip({ x: x0 + barW / 2, y: y(acc), title: d.label, rows: rowsFor(d) })
                          }
                        />
                      ) : null;
                    }
                    const x = x0 + si * (barW + GAP);
                    const h = Math.max(0, (v / top) * plotH);
                    return (
                      <path
                        key={s.key}
                        d={barPath(x, y(v), barW, h, true)}
                        fill={s.color}
                        tabIndex={0}
                        onFocus={() => setTip({ x: x0 + groupW / 2, y: y(Math.max(...d.values)), title: d.label, rows: rowsFor(d) })}
                        onBlur={() => setTip(null)}
                        onPointerEnter={() =>
                          setTip({
                            x: x0 + groupW / 2,
                            y: y(Math.max(...d.values)),
                            title: d.label,
                            rows: rowsFor(d),
                          })
                        }
                      />
                    );
                  })}
                  {/* Hit area wider than the marks, so short columns are still hoverable. */}
                  <rect
                    x={PAD.left + band * di}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onPointerEnter={() =>
                      setTip({
                        x: PAD.left + band * di + band / 2,
                        y: y(totals[di]),
                        title: d.label,
                        rows: rowsFor(d),
                      })
                    }
                  />
                  <text
                    x={PAD.left + band * di + band / 2}
                    y={height - 10}
                    textAnchor="middle"
                    className={axisText}
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH}
              stroke="var(--viz-axis)"
              strokeWidth="1"
            />
          </svg>
          <Tooltip tip={tip} height={height} />
        </div>
      )}
    </ChartFrame>
  );
}

// Horizontal bars for nominal categories: one hue for every bar (length is
// already the magnitude), value direct-labelled at the tip.
export function BarChart({
  title,
  subtitle,
  data,
  color,
  format,
}: {
  title: string;
  subtitle?: string;
  data: Datum[];
  color: string;
  format: (v: number) => string;
}) {
  const series: Series[] = [{ key: "v", label: "Valor", color }];
  const rowH = 30;
  const height = Math.max(rowH * data.length + 16, 80);
  const labelW = 150;
  const valueW = 96;
  const plotW = W - labelW - valueW;
  const peak = Math.max(...data.map((d) => d.values[0] ?? 0), 0) || 1;

  return (
    <ChartFrame title={title} subtitle={subtitle} series={series} data={data} format={format}>
      {!data.length ? (
        <Empty height={160} />
      ) : (
        <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img">
          {data.map((d, i) => {
            const v = d.values[0] ?? 0;
            const w = (v / peak) * plotW;
            const y = 8 + i * rowH;
            return (
              <g key={d.label}>
                <text x={0} y={y + 15} className="fill-[var(--viz-ink)] text-[12px]">
                  {d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label}
                </text>
                {/* Horizontal bar: rounded at the value end, square at the axis. */}
                <path
                  d={`M${labelW},${y + 4} L${labelW + Math.max(w - 4, 0)},${y + 4} Q${labelW + Math.max(w, 4)},${y + 4} ${labelW + Math.max(w, 4)},${y + 8} L${labelW + Math.max(w, 4)},${y + 14} Q${labelW + Math.max(w, 4)},${y + 18} ${labelW + Math.max(w - 4, 0)},${y + 18} L${labelW},${y + 18} Z`}
                  fill={color}
                />
                <text
                  x={W}
                  y={y + 15}
                  textAnchor="end"
                  className="fill-[var(--viz-ink)] text-[12px] tabular-nums"
                >
                  {format(v)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
}

// Single-series trend: 2px line over a 10% wash, crosshair snapping to the
// nearest point (readers aim at a date, never at the line itself).
export function LineChart({
  title,
  subtitle,
  data,
  color,
  label,
  format,
  tick,
  height = 250,
}: {
  title: string;
  subtitle?: string;
  data: Datum[];
  color: string;
  label: string;
  format: (v: number) => string;
  tick: (v: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const series: Series[] = [{ key: "v", label, color }];
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const values = data.map((d) => d.values[0] ?? 0);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, max);
  // A rate never starts at zero: frame the actual range with a little air.
  const lo = min - (max - min) * 0.25 || min * 0.98;
  const hi = max + (max - min) * 0.15 || max * 1.02;
  const x = (i: number) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.values[0])}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;
  const ticks = [lo, (lo + hi) / 2, hi];
  // Thin the x labels so they never collide.
  const every = Math.ceil(data.length / 8);

  return (
    <ChartFrame title={title} subtitle={subtitle} series={series} data={data} format={format}>
      {!data.length ? (
        <Empty height={height} />
      ) : (
        <div className="relative" onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--viz-grid)"
                  strokeWidth="1"
                />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className={axisText}>
                  {tick(t)}
                </text>
              </g>
            ))}

            <path d={area} fill={color} opacity="0.1" />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {hover !== null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="var(--viz-axis)"
                  strokeWidth="1"
                />
                <circle
                  cx={x(hover)}
                  cy={y(data[hover].values[0])}
                  r="5"
                  fill={color}
                  stroke="var(--viz-surface)"
                  strokeWidth="2"
                />
              </g>
            )}

            {data.map((d, i) =>
              i % every === 0 ? (
                <text key={d.label} x={x(i)} y={height - 10} textAnchor="middle" className={axisText}>
                  {d.label}
                </text>
              ) : null,
            )}

            {/* Nearest-point layer: the pointer only has to be closest. */}
            {data.map((d, i) => {
              const w = plotW / data.length;
              return (
                <rect
                  key={`${d.label}-hit`}
                  x={x(i) - w / 2}
                  y={PAD.top}
                  width={w}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onPointerEnter={() => setHover(i)}
                />
              );
            })}

            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH}
              stroke="var(--viz-axis)"
              strokeWidth="1"
            />
          </svg>
          <Tooltip
            tip={
              hover === null
                ? null
                : {
                    x: x(hover),
                    y: y(data[hover].values[0]),
                    title: data[hover].label,
                    rows: [{ label, color, value: format(data[hover].values[0]) }],
                  }
            }
            height={height}
          />
        </div>
      )}
    </ChartFrame>
  );
}

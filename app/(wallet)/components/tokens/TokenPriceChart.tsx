"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from "react";
import Decimal from "decimal.js";
import { classNames } from "@/app/utils";
import { shellFocusRingClasses } from "../shellFocusStyles";
import type { TokenHistoryRange } from "@/app/lib/tokens/market-id";

const money = Decimal.clone({ precision: 40 });

const VIEWBOX_WIDTH = 640;
const VIEWBOX_HEIGHT = 320;
const PADDING_Y = 12;
const TOOLTIP_CARD_WIDTH = 256;
const TOOLTIP_CARD_HEIGHT = 83;
const MARKER_SIZE = 16;
const MARKER_HALO_SIZE = 34;
const CARD_GAP_ABOVE_MARKER = 18;

export type ChartPointTuple = [number, string];

type ChartSample = {
  t: number;
  price: string;
  value: number;
  x: number;
  y: number;
};

/**
 * History tuples are `[unixSeconds, unitUsdPrice]`. Invalid prices/timestamps
 * are dropped together so tooltip time stays aligned with the drawn series.
 * Delta baseline is the first remaining sample in the selected range — change
 * over this window — not holdings value and not 24h snapshot PnL.
 */
export function parseChartSamples(
  points: ChartPointTuple[],
  width = VIEWBOX_WIDTH,
  height = VIEWBOX_HEIGHT,
  paddingY = PADDING_Y,
): ChartSample[] {
  const parsed: Array<{ t: number; price: string; value: number }> = [];
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) continue;
    const t = point[0];
    const rawPrice = point[1];
    if (!Number.isFinite(t) || typeof rawPrice !== "string") continue;
    try {
      const value = money(rawPrice.trim()).toNumber();
      if (!Number.isFinite(value)) continue;
      parsed.push({ t, price: rawPrice.trim(), value });
    } catch {
      continue;
    }
  }
  if (parsed.length === 0) return [];

  const values = parsed.map((sample) => sample.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerHeight = height - paddingY * 2;
  const last = Math.max(parsed.length - 1, 1);

  return parsed.map((sample, index) => ({
    ...sample,
    x: (index / last) * width,
    y:
      paddingY +
      innerHeight -
      ((sample.value - min) / span) * innerHeight,
  }));
}

function buildPriceChartPath(samples: ChartSample[]): string | null {
  if (samples.length < 2) return null;
  return samples
    .map((sample, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${sample.x.toFixed(2)} ${sample.y.toFixed(2)}`;
    })
    .join(" ");
}

function marketPriceMaximumFractionDigits(
  abs: InstanceType<typeof money>,
): number {
  if (abs.isZero() || abs.gte(1)) return 2;
  if (abs.gte("0.01")) return 4;
  if (abs.gte("0.0001")) return 6;
  return 8;
}

function sourceFractionDigits(price: string): number {
  const fraction = price.trim().split(".")[1] ?? "";
  return fraction.replace(/0+$/, "").length;
}

function digitsForNonZeroAmount(
  abs: InstanceType<typeof money>,
  sourceDigits = 0,
): number {
  let digits = Math.max(
    2,
    sourceDigits,
    marketPriceMaximumFractionDigits(abs),
  );
  while (
    digits < 8 &&
    !abs.isZero() &&
    abs.toDecimalPlaces(digits, Decimal.ROUND_HALF_UP).isZero()
  ) {
    digits += 2;
  }
  return digits;
}

export function formatTooltipUnitPrice(price: string): string {
  try {
    const trimmed = price.trim();
    const value = money(trimmed);
    const abs = value.abs();
    const digits = digitsForNonZeroAmount(
      abs.isZero() ? money(1) : abs,
      sourceFractionDigits(trimmed),
    );
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    }).format(value.toNumber());
  } catch {
    return "—";
  }
}

function formatTooltipDeltaUsd(
  absDelta: InstanceType<typeof money>,
  sourceDigits = 0,
): string {
  const digits = digitsForNonZeroAmount(absDelta, sourceDigits);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(absDelta.toNumber());
}

function formatTooltipDeltaPct(absPct: InstanceType<typeof money>): string {
  let digits = 2;
  while (
    digits < 6 &&
    !absPct.isZero() &&
    absPct.toDecimalPlaces(digits, Decimal.ROUND_HALF_UP).isZero()
  ) {
    digits += 2;
  }
  return `${absPct.toFixed(digits)}%`;
}

export function formatChartSampleDate(
  unixSeconds: number,
  range: TokenHistoryRange,
): string {
  const ms = unixSeconds > 1e12 ? unixSeconds : unixSeconds * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";

  if (range === "1D") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
  if (range === "1Y" || range === "ALL") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      year: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function nearestSampleIndex(
  clientX: number,
  rect: { left: number; width: number },
  count: number,
): number {
  if (count <= 1) return 0;
  const ratio = clamp((clientX - rect.left) / (rect.width || 1), 0, 1);
  return Math.round(ratio * (count - 1));
}

export function tooltipCardPosition(
  cssX: number,
  cssY: number,
  containerW: number,
  containerH: number,
): { left: number; top: number; width: number } {
  const width = Math.min(TOOLTIP_CARD_WIDTH, Math.max(0, containerW));
  const height = Math.min(TOOLTIP_CARD_HEIGHT, Math.max(0, containerH));
  const left = clamp(cssX - width / 2, 0, Math.max(0, containerW - width));
  const preferredTop =
    cssY - MARKER_SIZE / 2 - CARD_GAP_ABOVE_MARKER - height;
  const top = clamp(preferredTop, 0, Math.max(0, containerH - height));
  return { left, top, width };
}

function ChartTrendCaret({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width={12}
      height={6}
      viewBox="0 0 12 6"
      className="shrink-0"
      aria-hidden
    >
      {direction === "up" ? (
        <path d="M6 0 12 6H0Z" fill="currentColor" />
      ) : (
        <path d="M0 0h12L6 6Z" fill="currentColor" />
      )}
    </svg>
  );
}

function PriceChartTooltipCard({
  sample,
  baseline,
  range,
  left,
  top,
  width,
}: {
  sample: ChartSample;
  baseline: ChartSample;
  range: TokenHistoryRange;
  left: number;
  top: number;
  width: number;
}) {
  const selected = money(sample.price);
  const first = money(baseline.price);
  const delta = selected.minus(first);
  const tone = delta.isPositive() ? "up" : delta.isNegative() ? "down" : "flat";
  const absDelta = delta.abs();
  const absPct = first.isZero()
    ? null
    : delta.abs().div(first).mul(100);

  return (
    <div
      data-testid="token-price-chart-tooltip"
      className="pointer-events-none absolute z-20 flex flex-col gap-[5px] rounded-[16px] bg-white px-4 py-[19px] shadow-[0_25px_50px_-12px_#12121740] dark:bg-surface-canvas"
      style={{ left, top, width }}
      role="status"
    >
      <p
        data-testid="token-price-chart-tooltip-price"
        className="text-[20px] font-medium leading-5 tracking-[-0.01em] text-text-body dark:text-white"
      >
        {formatTooltipUnitPrice(sample.price)}
      </p>
      <div className="flex items-center gap-2 whitespace-nowrap text-xs font-medium leading-5 tracking-[-0.01em]">
        <span
          data-testid="token-price-chart-tooltip-delta"
          className={classNames(
            "inline-flex items-center gap-[3px]",
            tone === "up" && "text-[#227738] dark:text-[#39c65d]",
            tone === "down" && "text-accent-red",
            tone === "flat" && "text-text-secondary dark:text-white/50",
          )}
        >
          {tone === "up" ? (
            <ChartTrendCaret direction="up" />
          ) : tone === "down" ? (
            <ChartTrendCaret direction="down" />
          ) : null}
          {formatTooltipDeltaUsd(
            absDelta,
            Math.max(
              sourceFractionDigits(sample.price),
              sourceFractionDigits(baseline.price),
            ),
          )}
          {absPct
            ? ` (${formatTooltipDeltaPct(absPct)})`
            : " (—)"}
        </span>
        <span
          data-testid="token-price-chart-tooltip-date"
          className="text-text-secondary dark:text-white/50"
        >
          {formatChartSampleDate(sample.t, range)}
        </span>
      </div>
    </div>
  );
}

function PriceChartMarker({
  cssX,
  cssY,
  chartHeight,
}: {
  cssX: number;
  cssY: number;
  chartHeight: number;
}) {
  const guideTop = cssY + MARKER_SIZE / 2;
  const guideHeight = Math.max(0, chartHeight - guideTop);

  return (
    <>
      {guideHeight > 0 ? (
        <div
          data-testid="token-price-chart-guide"
          className="pointer-events-none absolute z-10 w-px bg-border-light dark:bg-white/10"
          style={{
            left: cssX,
            top: guideTop,
            height: guideHeight,
          }}
        />
      ) : null}
      <svg
        data-testid="token-price-chart-marker"
        width={MARKER_HALO_SIZE}
        height={MARKER_HALO_SIZE}
        viewBox="0 0 34 34"
        overflow="visible"
        className="pointer-events-none absolute z-10 block"
        style={{
          left: cssX - MARKER_HALO_SIZE / 2,
          top: cssY - MARKER_HALO_SIZE / 2,
        }}
        aria-hidden
      >
        <circle cx="17" cy="17" r="8" fill="#ffffff" />
        <circle
          cx="17"
          cy="17"
          r="12.5"
          fill="none"
          strokeWidth={9}
          className="stroke-border-light dark:stroke-white/10"
        />
      </svg>
    </>
  );
}

export function PriceLineChart({
  points,
  range,
  seriesKey,
  className,
  unavailable,
  isLoading,
}: {
  points: ChartPointTuple[];
  range: TokenHistoryRange;
  seriesKey?: string;
  className?: string;
  unavailable?: boolean;
  isLoading?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const samples = useMemo(() => parseChartSamples(points), [points]);
  const path = buildPriceChartPath(samples);
  const areaPath =
    path != null
      ? `${path} L ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT} L 0 ${VIEWBOX_HEIGHT} Z`
      : null;

  useEffect(() => {
    setActiveIndex(null);
  }, [seriesKey, range]);

  const active =
    activeIndex != null ? (samples[activeIndex] ?? null) : null;
  const baseline = samples[0] ?? null;

  const selectFromClientX = (clientX: number) => {
    const el = rootRef.current;
    if (!el || samples.length === 0) return;
    const rect = el.getBoundingClientRect();
    setActiveIndex(nearestSampleIndex(clientX, rect, samples.length));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (samples.length < 2) return;
    selectFromClientX(event.clientX);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (samples.length < 2) return;
    selectFromClientX(event.clientX);
  };

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    setActiveIndex(null);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      setActiveIndex(null);
    }
  };

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (samples.length < 2) return;
    selectFromClientX(event.clientX);
  };

  const onMouseLeave = () => {
    setActiveIndex(null);
  };

  const clientXFromTouch = (event: TouchEvent<HTMLDivElement>) =>
    event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX;

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (samples.length < 2) return;
    const clientX = clientXFromTouch(event);
    if (clientX != null) selectFromClientX(clientX);
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (samples.length < 2) return;
    const clientX = clientXFromTouch(event);
    if (clientX != null) selectFromClientX(clientX);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (samples.length < 2) return;
    if (event.key === "Escape") {
      setActiveIndex(null);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(samples.length - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIndex((current) =>
        current == null
          ? samples.length - 1
          : Math.min(samples.length - 1, current + 1),
      );
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIndex((current) =>
        current == null ? 0 : Math.max(0, current - 1),
      );
    }
  };

  if (isLoading) {
    return (
      <div
        className={classNames(
          "h-[320px] w-full rounded-xl bg-gray-200 animate-pulse motion-reduce:animate-none dark:bg-white/10",
          className,
        )}
        data-testid="token-price-chart"
        aria-busy="true"
        aria-label="Loading"
      />
    );
  }

  if (unavailable || !path) {
    return (
      <div
        className={classNames(
          "flex h-[320px] w-full items-center justify-center rounded-xl bg-accent-gray/30 dark:bg-white/5",
          className,
        )}
        data-testid="token-price-chart"
        role="status"
      >
        <span className="text-sm text-text-secondary dark:text-white/50">
          Chart unavailable
        </span>
      </div>
    );
  }

  const rect = rootRef.current?.getBoundingClientRect();
  const widthPx = rect?.width || VIEWBOX_WIDTH;
  const heightPx = rect?.height || VIEWBOX_HEIGHT;
  const cssX =
    active != null ? (active.x / VIEWBOX_WIDTH) * widthPx : 0;
  const cssY =
    active != null ? (active.y / VIEWBOX_HEIGHT) * heightPx : 0;
  const card =
    active != null
      ? tooltipCardPosition(cssX, cssY, widthPx, heightPx)
      : null;

  return (
    <div
      ref={rootRef}
      className={classNames(
        "relative h-[320px] w-full touch-pan-y",
        shellFocusRingClasses,
        className,
      )}
      data-testid="token-price-chart"
      tabIndex={0}
      role="group"
      aria-label="Price chart"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setActiveIndex(null)}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => setActiveIndex(null)}
      onTouchCancel={() => setActiveIndex(null)}
      onBlur={() => setActiveIndex(null)}
      onKeyDown={onKeyDown}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-[320px] w-full"
        data-testid="token-price-chart-svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="token-price-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath ? (
          <path d={areaPath} fill="url(#token-price-fill)" stroke="none" />
        ) : null}
        <path
          d={path}
          fill="none"
          stroke="rgb(34, 197, 94)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {active && baseline && card ? (
        <>
          <PriceChartMarker
            cssX={cssX}
            cssY={cssY}
            chartHeight={heightPx}
          />
          <PriceChartTooltipCard
            sample={active}
            baseline={baseline}
            range={range}
            left={card.left}
            top={card.top}
            width={card.width}
          />
        </>
      ) : null}
    </div>
  );
}

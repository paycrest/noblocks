"use client";

import Decimal from "decimal.js";
import { classNames } from "@/app/utils";

const money = Decimal.clone({ precision: 40 });

type PriceLineChartProps = {
  points: Array<[number, string]>;
  className?: string;
  unavailable?: boolean;
  isLoading?: boolean;
};

function buildPath(
  values: number[],
  width: number,
  height: number,
  paddingY: number,
): string | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerHeight = height - paddingY * 2;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y =
        paddingY + innerHeight - ((value - min) / span) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function PriceLineChart({
  points,
  className,
  unavailable,
  isLoading,
}: PriceLineChartProps) {
  const width = 640;
  const height = 220;
  const paddingY = 12;

  const values = points
    .map(([, price]) => {
      try {
        return money(price.trim()).toNumber();
      } catch {
        return Number.NaN;
      }
    })
    .filter((n) => Number.isFinite(n));

  const path = buildPath(values, width, height, paddingY);
  const areaPath =
    path != null
      ? `${path} L ${width} ${height} L 0 ${height} Z`
      : null;

  if (isLoading) {
    return (
      <div
        className={classNames(
          "flex h-[220px] items-center justify-center rounded-xl bg-accent-gray/30 dark:bg-white/5",
          className,
        )}
        aria-busy="true"
      >
        <span className="text-sm text-text-secondary dark:text-white/50">
          Loading chart…
        </span>
      </div>
    );
  }

  if (unavailable || !path) {
    return (
      <div
        className={classNames(
          "flex h-[220px] items-center justify-center rounded-xl bg-accent-gray/30 dark:bg-white/5",
          className,
        )}
        role="status"
      >
        <span className="text-sm text-text-secondary dark:text-white/50">
          Chart unavailable
        </span>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={classNames("h-[220px] w-full", className)}
      role="img"
      aria-label="Price chart"
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
      />
    </svg>
  );
}

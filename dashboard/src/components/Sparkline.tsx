import React from "react";

export function Sparkline({
  values,
  width = 180,
  height = 44,
  stroke = "#18181b",
  fill = "rgba(24, 24, 27, 0.08)",
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}) {
  const padded = values.filter((v) => Number.isFinite(v));
  if (padded.length < 2) {
    return <div className="h-[44px] rounded-xl bg-zinc-50" />;
  }

  const min = Math.min(...padded);
  const max = Math.max(...padded);
  const range = Math.max(1e-6, max - min);

  const stepX = width / (padded.length - 1);
  const points = padded.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}


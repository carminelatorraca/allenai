"use client";

import { useMemo, useRef, useState } from "react";
import "./mini-line-chart.css";

export type MiniLineChartPoint = {
  key: string;
  date: string;
  value: number;
};

type Props = {
  points: MiniLineChartPoint[];
  unit: string;
};

const VBW = 640;
const VBH = 230;
const MARGIN = { top: 28, right: 14, bottom: 30, left: 38 };
const PLOT_W = VBW - MARGIN.left - MARGIN.right;
const PLOT_H = VBH - MARGIN.top - MARGIN.bottom;

function formatShortDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });
}

function niceValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/*
 * Grafico a linea minimale per una singola serie (data -> valore): usato
 * sia per la progressione di un esercizio sia per lo storico del peso
 * corporeo. Nessuna libreria esterna: pochi punti, una sola serie, un SVG
 * fatto a mano basta e non appesantisce il bundle.
 */
export default function MiniLineChart({ points, unit }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (!points.length) return null;

    const values = points.map((point) => point.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = rawMax === rawMin ? Math.max(1, rawMax * 0.1) : (rawMax - rawMin) * 0.15;
    const yMin = Math.max(0, rawMin - padding);
    const yMax = rawMax + padding;

    const xForIndex = (index: number) =>
      points.length === 1
        ? MARGIN.left + PLOT_W / 2
        : MARGIN.left + (index / (points.length - 1)) * PLOT_W;

    const yForValue = (value: number) =>
      MARGIN.top + (1 - (value - yMin) / (yMax - yMin || 1)) * PLOT_H;

    const coords = points.map((point, index) => ({
      x: xForIndex(index),
      y: yForValue(point.value),
      point,
    }));

    const linePath = coords
      .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
      .join(" ");

    const gridValues = [yMin, (yMin + yMax) / 2, yMax];

    return { coords, linePath, gridValues, yMin, yMax };
  }, [points]);

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!chart || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = VBW / rect.width;
    const xInViewBox = (event.clientX - rect.left) * scaleX;

    let nearest = 0;
    let nearestDistance = Infinity;
    chart.coords.forEach((coord, index) => {
      const distance = Math.abs(coord.x - xInViewBox);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });

    setHoverIndex(nearest);
  }

  if (!chart) return null;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredCoord = hoverIndex !== null ? chart.coords[hoverIndex] : null;

  return (
    <svg
      ref={svgRef}
      className="mini-line-chart"
      viewBox={`0 0 ${VBW} ${VBH}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverIndex(null)}
    >
      {chart.gridValues.map((value, index) => {
        const y = MARGIN.top + (1 - (value - chart.yMin) / (chart.yMax - chart.yMin || 1)) * PLOT_H;
        return (
          <g key={index}>
            <line
              x1={MARGIN.left}
              x2={VBW - MARGIN.right}
              y1={y}
              y2={y}
              className="mini-line-chart__grid"
            />
            <text
              x={MARGIN.left - 8}
              y={y}
              className="mini-line-chart__axis-label"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {niceValue(value)}
            </text>
          </g>
        );
      })}

      <text x={MARGIN.left} y={VBH - 8} className="mini-line-chart__axis-label" textAnchor="start">
        {formatShortDate(points[0].date)}
      </text>
      <text x={VBW - MARGIN.right} y={VBH - 8} className="mini-line-chart__axis-label" textAnchor="end">
        {formatShortDate(points[points.length - 1].date)}
      </text>

      <path d={chart.linePath} className="mini-line-chart__line" />

      {hoveredCoord && (
        <line
          x1={hoveredCoord.x}
          x2={hoveredCoord.x}
          y1={MARGIN.top}
          y2={VBH - MARGIN.bottom}
          className="mini-line-chart__crosshair"
        />
      )}

      {chart.coords.map((coord, index) => (
        <circle
          key={coord.point.key}
          cx={coord.x}
          cy={coord.y}
          r={index === hoverIndex || index === chart.coords.length - 1 ? 5 : 4}
          className="mini-line-chart__dot"
        />
      ))}

      <text
        x={chart.coords[chart.coords.length - 1].x}
        y={chart.coords[chart.coords.length - 1].y - 12}
        className="mini-line-chart__end-label"
        textAnchor="end"
      >
        {niceValue(points[points.length - 1].value)} {unit}
      </text>

      {hovered && hoveredCoord && (
        <g
          transform={`translate(${Math.min(Math.max(hoveredCoord.x, MARGIN.left + 55), VBW - MARGIN.right - 55)}, ${Math.max(hoveredCoord.y - 44, MARGIN.top)})`}
        >
          <rect x={-55} y={-26} width={110} height={40} rx={8} className="mini-line-chart__tooltip-box" />
          <text x={0} y={-10} textAnchor="middle" className="mini-line-chart__tooltip-value">
            {niceValue(hovered.value)} {unit}
          </text>
          <text x={0} y={6} textAnchor="middle" className="mini-line-chart__tooltip-date">
            {formatShortDate(hovered.date)}
          </text>
        </g>
      )}
    </svg>
  );
}

'use client';
import { useEffect, useRef } from 'react';

export default function IndexChart({ data, height = 320 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    let cancelled = false;

    (async () => {
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        height,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
          fontFamily: 'Vazirmatn, sans-serif',
        },
        grid: {
          vertLines: { color: 'rgba(30, 42, 68, 0.3)' },
          horzLines: { color: 'rgba(30, 42, 68, 0.3)' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1e2a44' },
        timeScale: { borderColor: '#1e2a44', timeVisible: false },
      });

      const areaSeries = chart.addAreaSeries({
        lineColor: '#06b6d4',
        topColor: 'rgba(6, 182, 212, 0.4)',
        bottomColor: 'rgba(6, 182, 212, 0.02)',
        lineWidth: 2,
      });

      // Convert YYYYMMDD → timestamp
      const toTime = (d) => {
        const s = String(d);
        return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
      };

      const chartData = data
        .filter(r => r.c > 0)
        .map(r => ({ time: toTime(r.d), value: r.c }))
        .sort((a, b) => a.time.localeCompare(b.time));

      areaSeries.setData(chartData);
      chart.timeScale().fitContent();
      chartRef.current = chart;

      const ro = new ResizeObserver(() => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      });
      ro.observe(containerRef.current);

      return () => { ro.disconnect(); };
    })();

    return () => {
      cancelled = true;
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [data, height]);

  return <div ref={containerRef} className="w-full" />;
}

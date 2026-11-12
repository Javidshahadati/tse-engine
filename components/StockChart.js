'use client';
import { useEffect, useRef } from 'react';

export default function StockChart({ data, height = 360 }) {
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
        layout: { background: { type: ColorType.Solid, color: 'transparent' },
                  textColor: '#94a3b8', fontFamily: 'Vazirmatn, sans-serif' },
        grid: { vertLines: { color: 'rgba(30, 42, 68, 0.3)' },
                horzLines: { color: 'rgba(30, 42, 68, 0.3)' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1e2a44' },
        timeScale: { borderColor: '#1e2a44', timeVisible: true },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#f43f5e',
        borderUpColor: '#10b981', borderDownColor: '#f43f5e',
        wickUpColor: '#10b981', wickDownColor: '#f43f5e',
      });

      const toTime = (t) => {
        const s = String(t);
        return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
      };

      const chartData = data.map(r => ({
        time: toTime(r.t), open: r.o, high: r.h, low: r.l, close: r.c,
      })).sort((a, b) => a.time.localeCompare(b.time));

      candleSeries.setData(chartData);
      chart.timeScale().fitContent();
      chartRef.current = chart;

      const ro = new ResizeObserver(() => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      });
      ro.observe(containerRef.current);

      return () => ro.disconnect();
    })();

    return () => {
      cancelled = true;
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [data, height]);

  return <div ref={containerRef} className="w-full" />;
}

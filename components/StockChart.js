'use client';
import { useEffect, useRef, useState } from 'react';

function resample(data, timeframe) {
  if (timeframe === '1D' || data.length === 0) return data;
  const result = [];
  const n = data.length;
  const step = timeframe === '1W' ? 5 : 21;
  for (let i = 0; i < n; i += step) {
    const slice = data.slice(i, Math.min(i + step, n));
    if (slice.length === 0) continue;
    result.push({
      t: slice[slice.length - 1].t,
      o: slice[0].o,
      h: Math.max(...slice.map(x => x.h)),
      l: Math.min(...slice.map(x => x.l)),
      c: slice[slice.length - 1].c,
      v: slice.reduce((a, b) => a + (b.v || 0), 0),
    });
  }
  return result;
}

export default function StockChart({ data, height = 440 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [tf, setTf] = useState('1D');

  const displayData = resample(data || [], tf);

  useEffect(() => {
    if (!containerRef.current || displayData.length === 0) return;
    let cancelled = false;

    (async () => {
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');
      if (cancelled || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        height,
        layout: { background: { type: ColorType.Solid, color: 'transparent' },
                  textColor: '#94a3b8', fontFamily: 'Vazirmatn, sans-serif' },
        grid: { vertLines: { color: 'rgba(30, 42, 68, 0.2)' },
                horzLines: { color: 'rgba(30, 42, 68, 0.2)' } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#1e2a44', scaleMargins: { top: 0.1, bottom: 0.3 } },
        timeScale: { borderColor: '#1e2a44', timeVisible: true },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981', downColor: '#f43f5e',
        borderUpColor: '#10b981', borderDownColor: '#f43f5e',
        wickUpColor: '#10b981', wickDownColor: '#f43f5e',
      });

      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0 },
      });

      const toTime = (t) => {
        const s = String(t);
        return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
      };

      candleSeries.setData(displayData.map(r => ({
        time: toTime(r.t), open: r.o, high: r.h, low: r.l, close: r.c,
      })));

      volumeSeries.setData(displayData.map(r => ({
        time: toTime(r.t),
        value: r.v || 0,
        color: r.c >= r.o ? 'rgba(16, 185, 129, 0.5)' : 'rgba(244, 63, 94, 0.5)',
      })));

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
  }, [displayData, height]);

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {['1D', '1W', '1M'].map(t => (
          <button key={t} onClick={() => setTf(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tf === t ? 'bg-primary text-bg shadow-lg shadow-primary/30' : 'glass text-slate-300 hover:bg-white/10'
            }`}>
            {t === '1D' ? '۱ روزه' : t === '1W' ? '۱ هفته' : '۱ ماه'}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}

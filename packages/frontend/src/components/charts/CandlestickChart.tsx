import { useRef, useEffect } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, ColorType, type IChartApi } from 'lightweight-charts'

interface CandlestickData {
  time: string
  open: number
  high: number
  low: number
  close: number
}

interface CandlestickChartProps {
  data: CandlestickData[]
  height?: number
}

export default function CandlestickChart({ data, height = 400 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b8fa3',
      },
      grid: {
        vertLines: { color: '#2e3348' },
        horzLines: { color: '#2e3348' },
      },
      crosshair: {
        vertLine: { color: '#6366f1', width: 1, style: 2 },
        horzLine: { color: '#6366f1', width: 1, style: 2 },
      },
      timeScale: {
        borderColor: '#2e3348',
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: '#2e3348',
      },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    })

    candleSeries.setData(data)

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    volumeSeries.setData(
      data.map((d) => ({
        time: d.time,
        value: Math.random() * 10000000 + 1000000,
        color: d.close >= d.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
      }))
    )

    chart.timeScale().fitContent()
    chartRef.current = chart

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
    }
  }, [data, height])

  return <div ref={containerRef} />
}

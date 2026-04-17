// Generate sample OHLCV data for demonstration
export function generateSampleData(days: number = 252) {
  const data = []
  let price = 150
  const startDate = new Date('2024-01-02')

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + i)

    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue

    const volatility = 0.02
    const drift = 0.0003
    const change = price * (drift + volatility * (Math.random() - 0.5) * 2)
    const open = price
    const close = price + change
    const high = Math.max(open, close) + Math.abs(change) * Math.random()
    const low = Math.min(open, close) - Math.abs(change) * Math.random()

    data.push({
      time: date.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    })

    price = close
  }

  return data
}

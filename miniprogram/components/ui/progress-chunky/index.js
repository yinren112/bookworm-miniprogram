Component({
  properties: {
    percent: { type: Number, value: 0 },
    color: { type: String, value: 'yellow' },
    label: { type: String, value: '' },
    showLabel: { type: Boolean, value: false }
  },
  observers: {
    percent(v) {
      const raw = typeof v === 'number' ? v : Number(v)
      const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0
      this.setData({ displayPercent: Math.round(clamped) })
    }
  },
  data: {
    displayPercent: 0
  }
})

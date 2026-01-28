Component({
  properties: {
    active: { type: String, value: 'a' },
    height: { type: String, value: 'auto' },
    duration: { type: String, value: 'var(--duration-page)' },
    translateY: { type: String, value: 'var(--motion-translate-md)' },
    inactiveScale: { type: Number, value: 0.92 },
    mode: { type: String, value: 'fade' } // 'fade', 'depth'
  }
})

Component({
  properties: {
    visible: { type: Boolean, value: true },
    play: { type: Boolean, value: true },
    duration: { type: String, value: 'var(--duration-page)' },
    translateY: { type: String, value: 'var(--motion-translate-sm)' },
    inactiveScale: { type: Number, value: 0.98 },
    refreshKey: { type: String, value: '', observer: 'onKeyChange' },
    staggerIndex: { type: Number, value: 0 }
  },
  data: {
    keyCounter: 0
  },
  methods: {
    onKeyChange() {
      // Toggle visibility to re-trigger CSS animation
      this.setData({ keyCounter: this.data.keyCounter + 1 });
    }
  }
})

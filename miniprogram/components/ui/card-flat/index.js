Component({
  externalClasses: ['custom-class'],
  properties: {
    clickable: { type: Boolean, value: false },
    padding: { type: String, value: 'var(--space-8)' }
  },
  methods: {
    onTap(e) {
      if (this.data.clickable) {
        this.triggerEvent('tap', e)
      }
    }
  }
})

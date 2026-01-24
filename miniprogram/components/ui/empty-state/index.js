Component({
  properties: {
    status: { type: String, value: 'empty' },
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    desc: { type: String, value: '' },
    showAction: { type: Boolean, value: true },
    actionText: { type: String, value: '' },
    actionType: { type: String, value: 'primary' },
    primaryText: { type: String, value: '' },
    primaryType: { type: String, value: 'secondary' },
    secondaryText: { type: String, value: '' },
    secondaryType: { type: String, value: 'secondary' },
    useCard: { type: Boolean, value: false },
    cardPadding: { type: String, value: 'var(--space-10) var(--space-8)' }
  },
  data: {
    iconText: ''
  },
  observers: {
    status(v) {
      const map = { loading: '…', error: '!', empty: '—' }
      this.setData({ iconText: map[v] || '—' })
    }
  },
  methods: {
    onAction(e) {
      this.triggerEvent('action', e)
    },
    onPrimary(e) {
      this.triggerEvent('primary', e)
    },
    onSecondary(e) {
      this.triggerEvent('secondary', e)
    }
  }
})

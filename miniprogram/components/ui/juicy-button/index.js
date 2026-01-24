Component({
  properties: {
    type: { type: String, value: 'primary' },
    size: { type: String, value: 'md' },
    full: { type: Boolean, value: false },
    disabled: { type: Boolean, value: false },
    haptic: { type: String, value: 'light' },
    hapticEnabled: { type: Boolean, value: true },
    customStyle: { type: String, value: '' },
    openType: { type: String, value: '' }
  },
  methods: {
    onGetPhoneNumber(e) {
      this.triggerEvent('getphonenumber', e.detail)
    },
    onTap(e) {
      if (this.data.disabled) return;
      if (this.data.hapticEnabled && this.data.haptic) {
        try {
          const feedback = require('../../../utils/ui/feedback')
          feedback.tap(this.data.haptic)
        } catch (_) {
          void 0
        }
      }
      this.triggerEvent('tap', e)
    }
  }
})

const FALLBACK = {
  network: { title: '网络不稳定', desc: '请检查网络后重试' },
  empty: { title: '暂无内容', desc: '稍后再来看看' },
  forbidden: { title: '无权限', desc: '请确认账号权限' },
  unknown: { title: '出了点问题', desc: '请稍后重试' }
}

Component({
  properties: {
    mode: { type: String, value: 'unknown' },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    retryText: { type: String, value: '重试' },
    showRetry: { type: Boolean, value: true }
  },
  data: {
    resolvedTitle: '',
    resolvedDesc: '',
    iconText: '!'
  },
  observers: {
    mode(v) {
      const fallback = FALLBACK[v] || FALLBACK.unknown
      this.setData({ resolvedTitle: fallback.title, resolvedDesc: fallback.desc })
    }
  },
  methods: {
    onRetry(e) {
      this.triggerEvent('retry', e)
    }
  }
})

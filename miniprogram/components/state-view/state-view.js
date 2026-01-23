// components/state-view/state-view.js
Component({
  properties: {
    status: {
      type: String,
      value: ''
    },
    loadingText: {
      type: String,
      value: ''
    },
    emptyText: {
      type: String,
      value: '暂无内容'
    },
    errorText: {
      type: String,
      value: '加载失败'
    },
    actionText: {
      type: String,
      value: ''
    },
    skeletonType: {
      type: String,
      value: 'list'
    },
    skeletonCount: {
      type: Number,
      value: 3
    },
    showRetry: {
      type: Boolean,
      value: true
    },
    showFeedback: {
      type: Boolean,
      value: true
    }
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry');
    },
    onFeedback() {
      this.triggerEvent('feedback');
    },
    onAction() {
      this.triggerEvent('action');
    }
  }
});

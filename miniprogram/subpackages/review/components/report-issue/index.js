// subpackages/review/components/report-issue/index.js
// 纠错弹窗组件

const { submitFeedback } = require('../../utils/study-api');

Component({
  properties: {
    // 是否显示弹窗
    visible: {
      type: Boolean,
      value: false,
    },
    // 课程标识
    courseKey: {
      type: String,
      value: '',
    },
    // 卡片ID (可选)
    cardId: {
      type: Number,
      value: null,
    },
    // 题目ID (可选)
    questionId: {
      type: Number,
      value: null,
    },
  },

  data: {
    submitting: false,
    selectedReason: null,
    message: '',
    // 原因选项
    reasonOptions: [
      { value: 'ANSWER_ERROR', label: '答案错误', icon: '❌' },
      { value: 'STEM_AMBIGUOUS', label: '题目描述不清', icon: '❓' },
      { value: 'EXPLANATION_UNCLEAR', label: '解析不够清晰', icon: '💭' },
      { value: 'FORMAT_ERROR', label: '格式/排版问题', icon: '📝' },
      { value: 'OTHER', label: '其他问题', icon: '📢' },
    ],
  },

  methods: {
    // 选择原因
    selectReason(e) {
      const { value } = e.currentTarget.dataset;
      wx.vibrateShort({ type: 'light' });
      this.setData({ selectedReason: value });
    },

    // 输入补充说明
    onMessageInput(e) {
      this.setData({ message: e.detail.value });
    },

    // 提交反馈
    async handleSubmit() {
      const { selectedReason, message, submitting } = this.data;
      const { courseKey, cardId, questionId } = this.properties;

      if (submitting) return;

      if (!selectedReason) {
        wx.showToast({
          title: '请选择问题类型',
          icon: 'none',
        });
        return;
      }

      if (!courseKey) {
        wx.showToast({
          title: '缺少课程信息',
          icon: 'none',
        });
        return;
      }

      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        wx.showToast({
          title: '请填写问题描述',
          icon: 'none',
        });
        return;
      }

      this.setData({ submitting: true });

      try {
        const feedbackData = {
          courseKey,
          reason: selectedReason,
          message: trimmedMessage,
        };

        if (cardId) {
          feedbackData.cardId = cardId;
        }
        if (questionId) {
          feedbackData.questionId = questionId;
        }

        await submitFeedback(feedbackData);

        wx.vibrateShort({ type: 'medium' });
        wx.showToast({
          title: '反馈已提交',
          icon: 'success',
        });

        // 重置表单并关闭
        this.setData({
          submitting: false,
          selectedReason: null,
          message: '',
        });
        this.triggerEvent('close');
        this.triggerEvent('success');
      } catch (err) {
        console.error('Failed to submit feedback:', err);
        this.setData({ submitting: false });
        wx.showToast({
          title: '提交失败，请重试',
          icon: 'none',
        });
      }
    },

    // 关闭弹窗
    handleClose() {
      if (this.data.submitting) return;
      wx.vibrateShort({ type: 'light' });
      this.setData({
        selectedReason: null,
        message: '',
      });
      this.triggerEvent('close');
    },

    // 阻止冒泡
    preventBubble() {
      // 空函数，用于阻止点击内容区域时关闭弹窗
    },
  },
});

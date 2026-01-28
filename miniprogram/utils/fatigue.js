// miniprogram/utils/fatigue.js
// 学习疲劳检测工具

const FATIGUE_THRESHOLD_MS = 15 * 60 * 1000; // 15 分钟

/**
 * 创建疲劳检测器实例
 * @returns {Object} 疲劳检测器
 */
function createFatigueChecker() {
  let warned = false;

  return {
    /**
     * 检查是否应该提示休息
     * @param {number} startTime - 会话开始时间戳 (Date.now())
     * @returns {boolean} 是否触发了提示
     */
    check(startTime) {
      if (warned) return false;

      const elapsed = Date.now() - startTime;
      if (elapsed > FATIGUE_THRESHOLD_MS) {
        warned = true;
        wx.showModal({
          title: '休息一下',
          content: '已经学习很久了，休息一下眼睛吧，我会帮你保存进度。',
          showCancel: false,
          confirmText: '我知道了',
        });
        return true;
      }
      return false;
    },

    /**
     * 重置疲劳检测状态
     */
    reset() {
      warned = false;
    },

    /**
     * 检查是否已经警告过
     * @returns {boolean}
     */
    hasWarned() {
      return warned;
    },
  };
}

module.exports = {
  createFatigueChecker,
  FATIGUE_THRESHOLD_MS,
};

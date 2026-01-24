const { getCheatSheetDetail } = require("../../../../utils/study-api");
const studyTimer = require("../../../../utils/study-timer");
const logger = require("../../../../utils/logger");
const feedback = require("../../../../utils/ui/feedback");

Page({
  data: {
    loading: true,
    error: false,
    errorMsg: "",
    id: null,
    title: "",
    unitTitle: "",
    version: null,
    content: "",
    contentFormat: "markdown",
  },

  onLoad(options) {
    const id = options && options.id ? parseInt(options.id, 10) : null;
    if (!id) {
      this.setData({ loading: false, error: true, errorMsg: "缺少参数" });
      return;
    }
    this.setData({ id }, () => this.loadDetail());
  },

  onShow() {
    studyTimer.start("cheatsheet");
    studyTimer.onInteraction();
  },

  onHide() {
    studyTimer.flush();
    studyTimer.stop();
  },

  onUnload() {
    studyTimer.flush();
    studyTimer.stop();
  },

  onUserInteraction() {
    studyTimer.onInteraction();
  },

  async loadDetail() {
    this.setData({ loading: true, error: false, errorMsg: "" });
    try {
      const res = await getCheatSheetDetail(this.data.id);
      const sheet = res && res.cheatsheet ? res.cheatsheet : res;
      const assetType = String(sheet.assetType || "").toLowerCase();
      if (assetType !== "note") {
        wx.showToast({ title: "不是在线内容", icon: "none" });
      }
      this.setData({
        loading: false,
        title: sheet.title || "",
        unitTitle: sheet.unit && sheet.unit.title ? sheet.unit.title : "",
        version: sheet.version || null,
        content: sheet.content || "",
        contentFormat: sheet.contentFormat || "markdown",
      });
    } catch (err) {
      logger.error("Failed to load cheatsheet detail:", err);
      this.setData({ loading: false, error: true, errorMsg: "加载失败" });
    }
  },

  goBack() {
    feedback.tap("light");
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({
        url: "/pages/review/index",
      });
    }
  },

  onShareAppMessage() {
    return {
      title: this.data.title || "重点速记",
      path: "/pages/review/index",
    };
  },
});

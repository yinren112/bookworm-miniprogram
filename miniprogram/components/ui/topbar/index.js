const logger = require("../../../utils/logger");

Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    title: { type: String, value: "" },
    back: { type: Boolean, value: true },
    color: { type: String, value: "var(--color-text-main)" },
    background: { type: String, value: "var(--color-bg-page)" },
    show: { type: Boolean, value: true },
    delta: { type: Number, value: 1 },
  },
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
  },
  lifetimes: {
    attached() {
      try {
        const systemInfo = wx.getSystemInfoSync();
        const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
        const statusBarHeight = systemInfo.statusBarHeight;
        let navBarHeight =
          (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height;
        if (!navBarHeight || navBarHeight < 0) navBarHeight = 44;
        this.setData({ statusBarHeight, navBarHeight });
      } catch (e) {
        logger.warn("Topbar calc failed", e);
      }
    },
  },
  methods: {
    onBack() {
      if (this.data.back) {
        wx.navigateBack({ delta: this.data.delta });
      }
      this.triggerEvent("back");
    },
  },
});

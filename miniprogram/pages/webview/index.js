const { request } = require('../../utils/api');

Page({
  data: {
    content: null,
    isLoading: true,
    errorMsg: ''
  },

  onLoad(options) {
    const { slug } = options;
    if (!slug) {
      this.setData({
        isLoading: false,
        errorMsg: '页面参数错误'
      });
      return;
    }

    this.loadContent(slug);
  },

  async loadContent(slug) {
    try {
      const data = await request({
        url: `/content/${slug}`,
        method: 'GET'
      });
      const { title, body } = data;
      wx.setNavigationBarTitle({ title });
      this.setData({
        content: { title, body },
        isLoading: false
      });
    } catch (error) {
      console.error('Content load failed', error);
      this.setData({
        isLoading: false,
        errorMsg: error.error || '内容加载失败'
      });
    }
  }
});
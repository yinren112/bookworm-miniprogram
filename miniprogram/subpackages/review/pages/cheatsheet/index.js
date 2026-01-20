// subpackages/review/pages/cheatsheet/index.js
// 急救包页面

const { getCheatSheets } = require('../../utils/study-api');

Page({
  data: {
    loading: true,
    courseKey: '',
    unitId: null,
    cheatSheets: [],
    // 资源类型图标
    assetTypeIcons: {
      pdf: '📄',
      image: '🖼️',
      video: '🎬',
    },
  },

  onLoad(options) {
    const { courseKey, unitId } = options;
    if (courseKey) {
      this.setData({
        courseKey: decodeURIComponent(courseKey),
        unitId: unitId ? parseInt(unitId, 10) : null,
      });
      this.loadCheatSheets();
    } else {
      this.setData({ loading: false });
      wx.showToast({
        title: '缺少课程参数',
        icon: 'none',
      });
    }
  },

  async loadCheatSheets() {
    this.setData({ loading: true });

    try {
      const cheatSheets = await getCheatSheets(this.data.courseKey, this.data.unitId);
      const items = (cheatSheets || []).map((item) => {
        const assetTypeNormalized = String(item.assetType || '').toLowerCase();
        let assetTypeLabel = '资源';
        if (assetTypeNormalized === 'pdf') assetTypeLabel = 'PDF文档';
        if (assetTypeNormalized === 'image') assetTypeLabel = '图片';
        if (assetTypeNormalized === 'video') assetTypeLabel = '视频';

        return {
          ...item,
          assetTypeNormalized,
          assetTypeLabel,
        };
      });
      this.setData({
        cheatSheets: items,
        loading: false,
      });
    } catch (err) {
      console.error('Failed to load cheatsheets:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none',
      });
    }
  },

  previewCheatSheet(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.cheatSheets[index];

    if (!item || !item.url) {
      wx.showToast({
        title: '资源不可用',
        icon: 'none',
      });
      return;
    }

    wx.vibrateShort({ type: 'light' });

    const assetType = (item.assetTypeNormalized || '').toLowerCase();

    if (assetType === 'pdf') {
      // PDF 预览 - 使用文档预览
      wx.showLoading({ title: '加载中...' });
      wx.downloadFile({
        url: item.url,
        success: (res) => {
          wx.hideLoading();
          if (res.statusCode === 200) {
            wx.openDocument({
              filePath: res.tempFilePath,
              showMenu: true,
              success: () => {
                console.log('Document opened');
              },
              fail: (err) => {
                console.error('Failed to open document:', err);
                wx.showToast({
                  title: '打开失败',
                  icon: 'none',
                });
              },
            });
          } else {
            wx.showToast({
              title: '下载失败',
              icon: 'none',
            });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('Failed to download:', err);
          wx.showToast({
            title: '下载失败',
            icon: 'none',
          });
        },
      });
    } else if (assetType === 'image') {
      // 图片预览
      const imageUrls = this.data.cheatSheets
        .filter((cs) => cs.assetTypeNormalized === 'image')
        .map((cs) => cs.url);
      const currentIndex = imageUrls.indexOf(item.url);

      wx.previewImage({
        urls: imageUrls,
        current: item.url,
        showmenu: true,
        fail: (err) => {
          console.error('Failed to preview image:', err);
          wx.showToast({
            title: '预览失败',
            icon: 'none',
          });
        },
      });
    } else if (assetType === 'video') {
      // 视频暂不支持直接预览，提示用户
      wx.showToast({
        title: '请长按保存后观看',
        icon: 'none',
      });
    }
  },

  saveCheatSheet(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.cheatSheets[index];

    if (!item || !item.url) {
      wx.showToast({
        title: '资源不可用',
        icon: 'none',
      });
      return;
    }

    wx.vibrateShort({ type: 'light' });

    const assetType = (item.assetTypeNormalized || '').toLowerCase();

    if (assetType === 'image') {
      // 保存图片到相册
      wx.showLoading({ title: '保存中...' });
      wx.downloadFile({
        url: item.url,
        success: (res) => {
          if (res.statusCode === 200) {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.hideLoading();
                wx.showToast({
                  title: '已保存到相册',
                  icon: 'success',
                });
              },
              fail: (err) => {
                wx.hideLoading();
                if (err.errMsg.includes('auth deny')) {
                  wx.showModal({
                    title: '提示',
                    content: '需要授权相册权限才能保存图片',
                    confirmText: '去设置',
                    success: (res) => {
                      if (res.confirm) {
                        wx.openSetting();
                      }
                    },
                  });
                } else {
                  wx.showToast({
                    title: '保存失败',
                    icon: 'none',
                  });
                }
              },
            });
          } else {
            wx.hideLoading();
            wx.showToast({
              title: '下载失败',
              icon: 'none',
            });
          }
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({
            title: '下载失败',
            icon: 'none',
          });
        },
      });
    } else if (assetType === 'pdf') {
      // PDF 保存 - 使用文档预览的转发功能
      wx.showToast({
        title: '请在预览中点击右上角保存',
        icon: 'none',
        duration: 2000,
      });
      this.previewCheatSheet(e);
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({
        url: '/pages/review/index',
      });
    }
  },

  onShareAppMessage() {
    return {
      title: '复习急救包',
      path: '/pages/review/index',
    };
  },
});

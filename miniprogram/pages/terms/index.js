// miniprogram/pages/terms/index.js
const {
  TERMS_STORAGE_KEY,
  TERMS_ACCEPTED_AT_KEY,
  TERMS_VERSION_KEY,
  TERMS_VERSION,
  HOME_TAB_URL
} = require('../../utils/constants');

const TERMS_SECTIONS = [
  {
    title: '服务说明',
    paragraphs: [
      '本服务提供课程复习、刷题与学习记录等功能，具体内容以小程序页面实际展示为准。',
      '使用本服务即表示您同意遵守相关规则与使用规范。'
    ]
  },
  {
    title: '账号与使用规范',
    paragraphs: [
      '请妥善保管微信账号与设备，因个人原因导致的损失由用户自行承担。',
      '不得利用本服务从事违法违规、侵害他人权益或影响平台稳定的行为。'
    ]
  },
  {
    title: '内容与权益',
    paragraphs: [
      '小程序内的文字、图片等内容仅供学习使用，未经许可不得复制、传播或用于商业用途。',
      '若发现侵权或违规内容，请通过客服渠道联系我们处理。'
    ]
  },
  {
    title: '变更与终止',
    paragraphs: [
      '我们可能根据运营需要调整服务内容，并在小程序内提示或公告。',
      '若用户违反协议或相关法律法规，我们有权限制或终止服务。'
    ]
  },
  {
    title: '联系与反馈',
    paragraphs: [
      '如有任何问题或建议，请通过小程序内“客服”入口与我们联系。'
    ]
  }
];

const PRIVACY_SECTIONS = [
  {
    title: '信息收集范围',
    paragraphs: [
      '为提供服务，我们可能处理必要的账号标识信息（如 openid）、设备信息、学习记录与操作日志。',
      '我们仅在实现业务功能所必需的范围内收集与使用信息。'
    ]
  },
  {
    title: '使用目的',
    paragraphs: [
      '用于账号识别、功能提供、学习统计与安全风控。',
      '用于改进产品体验与服务质量。'
    ]
  },
  {
    title: '共享与披露',
    paragraphs: [
      '除法律法规要求或获得您的授权外，我们不会向无关第三方共享您的个人信息。',
      '必要时我们可能与服务提供方合作，但仅限于提供服务所需。'
    ]
  },
  {
    title: '存储与保护',
    paragraphs: [
      '我们采取合理安全措施保护信息安全，并在实现目的所需期限内保存数据。',
      '若发生安全事件，我们将依法依规告知并采取补救措施。'
    ]
  },
  {
    title: '您的权利',
    paragraphs: [
      '您可通过小程序内相关页面查看信息，或联系客户服务申请更正、删除与撤回授权。'
    ]
  }
];

function createAcceptedAt() {
  return new Date().toISOString();
}

Page({
  data: {
    activeTab: 'terms',
    termsSections: TERMS_SECTIONS,
    privacySections: PRIVACY_SECTIONS
  },

  onTabChange(e) {
    const nextTab = e.currentTarget.dataset.tab;
    if (!nextTab || nextTab === this.data.activeTab) return;
    this.setData({ activeTab: nextTab });
  },

  handleAccept() {
    const acceptedAt = createAcceptedAt();
    wx.setStorageSync(TERMS_STORAGE_KEY, true);
    wx.setStorageSync(TERMS_ACCEPTED_AT_KEY, acceptedAt);
    wx.setStorageSync(TERMS_VERSION_KEY, TERMS_VERSION);

    const app = getApp();
    if (app && app.globalData) {
      app.globalData.termsAccepted = true;
      app.globalData.termsAcceptedAt = acceptedAt;
      app.globalData.termsVersion = TERMS_VERSION;
    }

    wx.switchTab({
      url: HOME_TAB_URL,
      fail: () => {
        wx.reLaunch({ url: HOME_TAB_URL });
      }
    });
  },

  handleReject() {
    wx.showModal({
      title: '提示',
      content: '不同意《用户服务协议》和《隐私政策》将无法使用本服务。',
      confirmText: '退出小程序',
      cancelText: '返回查看',
      success: (res) => {
        if (res.confirm) {
          this.exitMiniProgram();
        }
      }
    });
  },

  exitMiniProgram() {
    const showManualCloseTip = () => {
      wx.showToast({
        title: '当前环境无法退出，请手动关闭小程序',
        icon: 'none',
        duration: 3000
      });
    };

    if (typeof wx.exitMiniProgram !== 'function') {
      showManualCloseTip();
      return;
    }

    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
    const isDevtools = systemInfo && systemInfo.platform === 'devtools';
    wx.exitMiniProgram({
      fail: showManualCloseTip
    });

    if (isDevtools) {
      showManualCloseTip();
    }
  }
});

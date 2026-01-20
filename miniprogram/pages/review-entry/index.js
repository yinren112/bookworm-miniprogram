// pages/review-entry/index.js

Page({
  onLoad() {
    wx.reLaunch({
      url: '/subpackages/review/pages/home/index',
    });
  },
});

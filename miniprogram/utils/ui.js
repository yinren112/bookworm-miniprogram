function showError(message = '请求失败，请稍后再试') {
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2000
  });
}

module.exports = {
  showError
};
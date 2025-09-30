const { request } = require('./api');
const ui = require('./ui');
const { extractErrorMessage } = require('./error');

function requestPayment(params) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...params,
      success: resolve,
      fail: reject,
    });
  });
}

async function createOrderAndPay(inventoryItemIds) {
  wx.showLoading({ title: '正在创建订单...' });
  const order = await request({
    url: '/orders/create',
    method: 'POST',
    data: { inventoryItemIds },
  });

  wx.showLoading({ title: '获取支付参数...' });
  const payParams = await request({
    url: '/orders/' + order.id + '/pay',
    method: 'POST',
  });

  wx.hideLoading();
  await requestPayment(payParams);
  return order;
}

async function safeCreateOrderAndPay(inventoryItemIds) {
  try {
    const order = await createOrderAndPay(inventoryItemIds);
    wx.showToast({ title: '支付成功', icon: 'success' });
    return { success: true, order };
  } catch (error) {
    wx.hideLoading();
    if (error && error.errMsg && error.errMsg.indexOf('cancel') !== -1) {
      wx.showToast({ title: '支付已取消', icon: 'none' });
      return { success: false, cancelled: true };
    }
    ui.showError(extractErrorMessage(error, '网络请求失败'));
    return { success: false, cancelled: false, error };
  }
}

module.exports = {
  createOrderAndPay,
  safeCreateOrderAndPay,
};

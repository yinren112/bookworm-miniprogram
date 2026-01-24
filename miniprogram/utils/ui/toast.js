const ui = require('../ui')

function info(title, options = {}) {
  const { duration = 2000 } = options
  wx.showToast({ title, icon: 'none', duration })
}

function success(title, options = {}) {
  const { duration = 1500 } = options
  ui.showSuccess(title, duration)
}

function error(errorLike, options = {}) {
  ui.showError(errorLike, options)
}

module.exports = {
  info,
  success,
  error
}

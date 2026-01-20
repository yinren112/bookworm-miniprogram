// miniprogram/utils/privacy.js
// 微信隐私保护指引：getPrivacySetting + openPrivacyContract 兜底链路

function getPrivacySetting() {
  return new Promise((resolve) => {
    if (typeof wx.getPrivacySetting !== 'function') {
      resolve({ needAuthorization: false })
      return
    }

    wx.getPrivacySetting({
      success: resolve,
      fail: () => resolve({ needAuthorization: false })
    })
  })
}

function openPrivacyContract() {
  return new Promise((resolve, reject) => {
    if (typeof wx.openPrivacyContract !== 'function') {
      reject(new Error('wx.openPrivacyContract is not available'))
      return
    }

    wx.openPrivacyContract({
      success: resolve,
      fail: reject
    })
  })
}

async function ensurePrivacyAuthorized({
  title = '隐私保护指引',
  content = '继续使用前，请阅读并同意隐私保护指引。'
} = {}) {
  const setting = await getPrivacySetting()
  if (!setting.needAuthorization) {
    return { needAuthorization: false, authorized: true }
  }

  return await new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText: '查看并同意',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) {
          resolve({ needAuthorization: true, authorized: false })
          return
        }

        try {
          await openPrivacyContract()
          resolve({ needAuthorization: true, authorized: true })
        } catch (_) {
          resolve({ needAuthorization: true, authorized: false })
        }
      },
      fail: () => resolve({ needAuthorization: true, authorized: false })
    })
  })
}

function setupPrivacyAuthorization() {
  if (typeof wx.onNeedPrivacyAuthorization !== 'function') return

  wx.onNeedPrivacyAuthorization((arg1, arg2) => {
    const resolve = typeof arg1 === 'function' ? arg1 : arg1?.resolve
    const reject = typeof arg2 === 'function' ? arg2 : arg1?.reject

    ensurePrivacyAuthorized().then(({ authorized }) => {
      if (authorized) {
        resolve?.({ buttonId: 'privacy-contract' })
      } else {
        reject?.()
      }
    })
  })
}

module.exports = {
  ensurePrivacyAuthorized,
  setupPrivacyAuthorization
}


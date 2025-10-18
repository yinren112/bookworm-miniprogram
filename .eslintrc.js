/*
 * Eslint config file
 * Documentation: https://eslint.org/docs/user-guide/configuring/
 * Install the Eslint extension before using this feature.
 */
module.exports = {
  env: {
    es6: true,
    browser: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  globals: {
    wx: true,
    App: true,
    Page: true,
    getCurrentPages: true,
    getApp: true,
    Component: true,
    requirePlugin: true,
    requireMiniProgram: true,
  },
  // extends: 'eslint:recommended',
  rules: {
    // 护栏：禁止在前端使用 console.log/debug，只允许 console.error
    // 防止敏感信息通过日志泄露到生产环境
    'no-console': ['error', {
      allow: ['error'], // 只允许 console.error 用于异常报告
    }],

    // 护栏：禁止在代码中打印敏感信息（phone/openid/pickupCode/code）
    // 即使是 console.error 也不应该包含这些敏感字段
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.object.name="console"] Literal[value=/(phone|openid|pickupCode|code|phoneNumber|phone_number)/i]',
        message: '禁止在 console 中打印敏感信息 (phone/openid/pickupCode/code)。这些字段可能泄露用户隐私。',
      },
      {
        selector: 'CallExpression[callee.object.name="console"] TemplateElement[value.raw=/(phone|openid|pickupCode|code|phoneNumber|phone_number)/i]',
        message: '禁止在 console 中打印敏感信息 (phone/openid/pickupCode/code)。这些字段可能泄露用户隐私。',
      },
      // 护栏：禁止在页面/组件中直接使用 wx.request
      // 必须使用封装的 utils/request.js 以确保统一的错误处理和安全控制
      {
        selector: "MemberExpression[object.name='wx'][property.name='request']",
        message: '禁止直接使用 wx.request，请改用 utils/request.js 或 utils/api.js。只有 utils/request.js 可以调用 wx.request。',
      },
    ],
  },
}

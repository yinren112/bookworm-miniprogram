// miniprogram/utils/date.js
// 日期处理工具函数

/**
 * 将 YYYY-MM-DD 格式的日期转换为中文星期标签
 * 使用北京时间（UTC+8）语义，与后端 getBeijingNow() 保持一致
 * @param {string} ymd - YYYY-MM-DD 格式的日期字符串
 * @returns {string} 星期标签（日、一、二、三、四、五、六）
 */
function ymdToWeekdayLabel(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const beijingTimestamp = utc.getTime() + 8 * 60 * 60 * 1000;
  const weekday = new Date(beijingTimestamp).getUTCDay();
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return days[weekday];
}

module.exports = {
  ymdToWeekdayLabel,
};

// subpackages/review/pages/activity-history/index.js
// 学习记录页

const { getActivityHistory, getDashboard } = require('../../utils/study-api');
const logger = require('../../../../utils/logger');
const { ymdToWeekdayLabel } = require('../../../../utils/date');

Page({
  data: {
    loading: true,
    error: false,
    empty: false,
    days: [],
    selectedDate: '',
    scrollTargetId: '',
    todayDurationText: '0分钟',
    totalDurationText: '0分钟',
    streakDays: 0,
    chartDays: [],
  },

  onLoad(options) {
    const { date } = options || {};
    this.setData({
      selectedDate: date || '',
    });
    this.loadHistory();
  },

  async loadHistory() {
    this.setData({ loading: true, error: false, empty: false });
    try {
      const [history, dashboard] = await Promise.all([
        getActivityHistory({ days: 35 }),
        getDashboard(),
      ]);

      const days = normalizeDays(history?.days || []);
      const totalDurationSeconds = Number(history?.totalDurationSeconds) || 0;
      const today = days.length > 0 ? days[days.length - 1] : null;
      const todayDurationSeconds = today ? today.totalDurationSeconds : 0;

      const chartDays = buildChartDays(days, 7);

      this.setData({
        days,
        loading: false,
        empty: days.length === 0,
        scrollTargetId: this.data.selectedDate ? `day-${this.data.selectedDate}` : '',
        todayDurationText: formatDuration(todayDurationSeconds),
        totalDurationText: formatDuration(totalDurationSeconds),
        streakDays: dashboard?.streakDays || 0,
        chartDays,
      });
    } catch (err) {
      logger.error('Failed to load activity history:', err);
      this.setData({ loading: false, error: true });
    }
  },

  onRetry() {
    this.loadHistory();
  },

  onFeedback() {
    wx.navigateTo({
      url: '/pages/customer-service/index',
    });
  },

  goHome() {
    wx.switchTab({
      url: '/pages/review/index',
    });
  },
});

function normalizeDays(days) {
  return (days || []).map((item) => {
    const cardSeconds = Number(item.cardDurationSeconds) || 0;
    const quizSeconds = Number(item.quizDurationSeconds) || 0;
    const cheatsheetSeconds = Number(item.cheatsheetDurationSeconds) || 0;
    const totalSeconds = Number(item.totalDurationSeconds) || cardSeconds + quizSeconds + cheatsheetSeconds;
    const breakdownText = formatBreakdown(cardSeconds, quizSeconds, cheatsheetSeconds);

    return {
      date: item.date,
      level: Number(item.level) || 0,
      totalDurationSeconds: totalSeconds,
      cardDurationSeconds: cardSeconds,
      quizDurationSeconds: quizSeconds,
      cheatsheetDurationSeconds: cheatsheetSeconds,
      totalText: formatDuration(totalSeconds),
      breakdownText,
    };
  });
}

function buildChartDays(days, range) {
  const source = (days || []).slice(-range);
  const maxTotalSeconds = Math.max(...source.map((d) => d.totalDurationSeconds || 0), 1);
  const barHeightRpx = 140;
  return source.map((d) => {
    const cardHeight = Math.round((barHeightRpx * (d.cardDurationSeconds || 0)) / maxTotalSeconds);
    const quizHeight = Math.round((barHeightRpx * (d.quizDurationSeconds || 0)) / maxTotalSeconds);
    const cheatsheetHeight = Math.round((barHeightRpx * (d.cheatsheetDurationSeconds || 0)) / maxTotalSeconds);
    return {
      date: d.date,
      dayLabel: ymdToWeekdayLabel(d.date),
      cardHeight,
      quizHeight,
      cheatsheetHeight,
      totalDurationSeconds: d.totalDurationSeconds,
    };
  });
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(seconds / 60);
  if (minutes <= 0) return '0分钟';
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours}小时`;
  return `${hours}小时${remainingMinutes}分钟`;
}

function formatBreakdown(cardSeconds, quizSeconds, cheatsheetSeconds) {
  const parts = [];
  if (cardSeconds > 0) parts.push(`卡片 ${formatDuration(cardSeconds)}`);
  if (quizSeconds > 0) parts.push(`刷题 ${formatDuration(quizSeconds)}`);
  if (cheatsheetSeconds > 0) parts.push(`急救包 ${formatDuration(cheatsheetSeconds)}`);
  return parts.join(' · ');
}

// subpackages/review/pages/activity-history/index.js
// 学习记录页 — 折叠式日历

const { getActivityHistory, getDashboard } = require('../../utils/study-api');
const logger = require('../../../../utils/logger');
const { ymdToWeekdayLabel, getBeijingDateOnlyString } = require('../../../../utils/date');

Page({
  data: {
    loading: true,
    error: false,
    empty: false,
    todayDurationText: '0分钟',
    totalDurationText: '0分钟',
    streakDays: 0,
    currentYear: 0,
    currentMonth: 0,
    monthLabel: '',
    calendarDays: [],
    selectedDate: '',
    selectedDetail: null,
    canGoNext: false,
  },

  onLoad(options) {
    const today = getBeijingDateOnlyString();
    const parts = today.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const initDate = (options && options.date) || '';

    let targetYear = year;
    let targetMonth = month;
    if (initDate) {
      const dp = initDate.split('-');
      if (dp.length === 3) {
        targetYear = Number(dp[0]) || year;
        targetMonth = Number(dp[1]) || month;
      }
    }

    this._today = today;
    this._todayYear = year;
    this._todayMonth = month;
    this._allDays = [];
    this._initDate = initDate;

    this.setData({
      currentYear: targetYear,
      currentMonth: targetMonth,
    });
    this.loadHistory();
  },

  async loadHistory() {
    this.setData({ loading: true, error: false, empty: false });
    try {
      const [history, dashboard] = await Promise.all([
        getActivityHistory({ days: 90 }),
        getDashboard(),
      ]);

      const days = normalizeDays(history?.days || []);
      this._allDays = days;

      const totalDurationSeconds = Number(history?.totalDurationSeconds) || 0;
      const todayItem = days.find((d) => d.date === this._today);
      const todayDurationSeconds = todayItem ? todayItem.totalDurationSeconds : 0;

      this.setData({
        loading: false,
        empty: days.length === 0,
        todayDurationText: formatDuration(todayDurationSeconds),
        totalDurationText: formatDuration(totalDurationSeconds),
        streakDays: dashboard?.streakDays || 0,
      });

      this.buildCalendar();

      if (this._initDate) {
        this.selectDate(this._initDate);
      }
    } catch (err) {
      logger.error('Failed to load activity history:', err);
      this.setData({ loading: false, error: true });
    }
  },

  buildCalendar() {
    const { currentYear, currentMonth } = this.data;
    const firstDay = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    const startWeekday = getUTC8Weekday(firstDay);
    const daysInMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();

    const dayMap = {};
    for (const d of this._allDays) {
      dayMap[d.date] = d;
    }

    const cells = [];

    // Leading empty cells
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ empty: true });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const item = dayMap[ymd];
      cells.push({
        empty: false,
        date: ymd,
        day: d,
        level: item ? item.level : 0,
        isToday: ymd === this._today,
        totalDurationSeconds: item ? item.totalDurationSeconds : 0,
      });
    }

    const canGoNext = currentYear < this._todayYear ||
      (currentYear === this._todayYear && currentMonth < this._todayMonth);

    this.setData({
      calendarDays: cells,
      monthLabel: `${currentYear}年${currentMonth}月`,
      canGoNext,
    });
  },

  prevMonth() {
    let { currentYear, currentMonth } = this.data;
    currentMonth -= 1;
    if (currentMonth < 1) {
      currentMonth = 12;
      currentYear -= 1;
    }
    this.setData({ currentYear, currentMonth, selectedDate: '', selectedDetail: null });
    this.buildCalendar();
  },

  nextMonth() {
    if (!this.data.canGoNext) return;
    let { currentYear, currentMonth } = this.data;
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
    this.setData({ currentYear, currentMonth, selectedDate: '', selectedDetail: null });
    this.buildCalendar();
  },

  onDayTap(e) {
    const { date } = e.currentTarget.dataset;
    if (!date) return;
    if (this.data.selectedDate === date) {
      this.setData({ selectedDate: '', selectedDetail: null });
      return;
    }
    this.selectDate(date);
  },

  selectDate(date) {
    const item = this._allDays.find((d) => d.date === date);
    const parts = date.split('-');
    const dayNum = Number(parts[2]);
    const weekday = ymdToWeekdayLabel(date);
    const monthNum = Number(parts[1]);

    const detail = {
      date,
      dateLabel: `${monthNum}月${dayNum}日 周${weekday}`,
      level: item ? item.level : 0,
      totalText: item ? item.totalText : '无记录',
      breakdownText: item ? item.breakdownText : '',
      hasData: !!item && item.totalDurationSeconds > 0,
    };

    this.setData({ selectedDate: date, selectedDetail: detail });
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

function getUTC8Weekday(utcDate) {
  const ts = utcDate.getTime() + 8 * 60 * 60 * 1000;
  return new Date(ts).getUTCDay();
}

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

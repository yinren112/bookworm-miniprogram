const logger = require('./logger');
const { pulseStudyActivity } = require('./study-api');

const STORAGE_PREFIX = 'study:durationTotals:';
const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
const TICK_INTERVAL_MS = 10 * 1000;

function getBeijingNow() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000 + now.getTimezoneOffset() * 60 * 1000);
}

function formatYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getBeijingYmdNow() {
  return formatYmd(getBeijingNow());
}

function getStorageKey(ymd) {
  return `${STORAGE_PREFIX}${ymd}`;
}

function loadDayTotals(ymd) {
  const key = getStorageKey(ymd);
  try {
    const raw = wx.getStorageSync(key);
    if (!raw) {
      return { card: 0, quiz: 0, cheatsheet: 0 };
    }
    const parsed = JSON.parse(raw);
    return {
      card: Number(parsed.card) || 0,
      quiz: Number(parsed.quiz) || 0,
      cheatsheet: Number(parsed.cheatsheet) || 0,
    };
  } catch (error) {
    logger.error('[study-timer] load totals failed', error);
    return { card: 0, quiz: 0, cheatsheet: 0 };
  }
}

function saveDayTotals(ymd, totals) {
  const key = getStorageKey(ymd);
  try {
    wx.setStorageSync(key, JSON.stringify(totals));
  } catch (error) {
    logger.error('[study-timer] save totals failed', error);
  }
}

class StudyTimer {
  constructor() {
    this._activeType = null;
    this._activeYmd = null;
    this._lastInteractionMs = 0;
    this._lastCountedAtMs = 0;
    this._tickTimer = null;
  }

  start(type) {
    const now = Date.now();
    const ymd = getBeijingYmdNow();

    if (this._activeType && this._activeType !== type) {
      this.stop();
    }

    if (this._activeYmd && this._activeYmd !== ymd) {
      this.stop();
    }

    this._activeType = type;
    this._activeYmd = ymd;
    this._lastInteractionMs = now;
    this._lastCountedAtMs = now;

    if (this._tickTimer) return;
    this._tickTimer = setInterval(() => {
      this.tick();
    }, TICK_INTERVAL_MS);
  }

  stop() {
    this.tick();
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
    this._activeType = null;
    this._activeYmd = null;
    this._lastInteractionMs = 0;
    this._lastCountedAtMs = 0;
  }

  onInteraction() {
    const now = Date.now();
    this._lastInteractionMs = now;
    if (this._lastCountedAtMs === 0) {
      this._lastCountedAtMs = now;
    }
  }

  tick() {
    if (!this._activeType || !this._activeYmd) return;
    if (!this._lastCountedAtMs) return;

    const now = Date.now();
    const currentYmd = getBeijingYmdNow();
    if (currentYmd !== this._activeYmd) {
      const previousYmd = this._activeYmd;
      this._activeYmd = currentYmd;
      this._lastInteractionMs = now;
      this._lastCountedAtMs = now;
      if (previousYmd) {
        this._flushYmd(previousYmd);
      }
      return;
    }
    const countedUntil = Math.min(now, this._lastInteractionMs + IDLE_TIMEOUT_MS);
    if (countedUntil <= this._lastCountedAtMs) return;

    const deltaSeconds = Math.floor((countedUntil - this._lastCountedAtMs) / 1000);
    if (deltaSeconds <= 0) return;

    this._lastCountedAtMs += deltaSeconds * 1000;

    const totals = loadDayTotals(this._activeYmd);
    totals[this._activeType] = (totals[this._activeType] || 0) + deltaSeconds;
    saveDayTotals(this._activeYmd, totals);
  }

  async flush() {
    this.tick();
    if (!this._activeYmd) return;
    await this._flushYmd(this._activeYmd);
  }

  async _flushYmd(ymd) {
    if (!ymd) return;
    const totals = loadDayTotals(ymd);

    const tasks = [];
    if (totals.card > 0) {
      tasks.push(pulseStudyActivity({ type: 'card', activityDate: ymd, totalDurationSeconds: totals.card }));
    }
    if (totals.quiz > 0) {
      tasks.push(pulseStudyActivity({ type: 'quiz', activityDate: ymd, totalDurationSeconds: totals.quiz }));
    }
    if (totals.cheatsheet > 0) {
      tasks.push(
        pulseStudyActivity({ type: 'cheatsheet', activityDate: ymd, totalDurationSeconds: totals.cheatsheet }),
      );
    }

    if (tasks.length === 0) return;

    try {
      await Promise.all(tasks);
    } catch (error) {
      logger.warn('[study-timer] flush failed', error);
    }
  }
}

module.exports = new StudyTimer();

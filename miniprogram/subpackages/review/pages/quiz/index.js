// subpackages/review/pages/quiz/index.js
// 刷题闯关页

const { startQuiz, submitQuizAnswer, starItem, unstarItem, getStarredItems } = require("../../utils/study-api");
const { saveResumeSession, clearResumeSession, setLastSessionType } = require("../../utils/study-session");
const { getValidResumeSession, clampIndex } = require("../../utils/study-resume-helpers");
const { toggleStarWithOptimisticUpdate } = require("../../utils/study-ui-helpers");
const { sanitizeMpHtmlContent } = require("../../utils/mp-html-sanitize");
const { getPageState, clearPageState } = require("../../utils/page-state");
const studyTimer = require("../../utils/study-timer");
const logger = require("../../../../utils/logger");
const { track } = require("../../../../utils/track");
const feedback = require("../../../../utils/ui/feedback");
const { createFatigueChecker } = require("../../../../utils/fatigue");
const { QUIZ_SECONDS_PER_ITEM, QUIZ_HINT_COUNT_KEY } = require("../../../../utils/constants");

function getQuizState(page) {
  return getPageState("review.quiz", page, () => ({
    questions: [],
    questionEnterTimer: null,
  }));
}

Page({
  data: {
    loading: true,
    error: false,
    empty: false,
    submitting: false, // 防重复提交
    courseKey: "",
    unitId: null,
    wrongItemsOnly: false,
    sessionId: "",
    questionsLength: 0,
    currentIndex: 0,
    currentQuestion: null,
    selectedAnswers: [],
    fillAnswer: "",
    showResult: false,
    lastResult: null,
    correctIndices: [],
    correctAnswerText: "",
    optionStates: [], // 每个选项的渲染状态 { isCorrect, isWrong, isSelected }
    answeredCount: 0,
    correctCount: 0,
    progressPercent: 0,
    remainingMinutes: 0,
    startTime: 0,
    isStarred: false, // Local Star State
    starredItems: {}, // Local cache
    nextType: "",
    // 常量
    questionTypeLabels: {
      SINGLE_CHOICE: "单选题",
      MULTI_CHOICE: "多选题",
      TRUE_FALSE: "判断题",
      FILL_BLANK: "填空题",
    },
    optionLabels: ["A", "B", "C", "D", "E", "F"],
    showReportModal: false,
    questionTypeClass: "",
    accuracyPercent: 0,
    questionEnter: true,
    lastSubmitAt: 0,
    autoAdvancing: false,
    showQuizHint: false,
  },

  playQuestionEnter() {
    const state = getQuizState(this);
    if (state.questionEnterTimer) {
      clearTimeout(state.questionEnterTimer);
      state.questionEnterTimer = null;
    }

    this.setData({ questionEnter: false }, () => {
      state.questionEnterTimer = setTimeout(() => {
        this.setData({ questionEnter: true });
        state.questionEnterTimer = null;
      }, 0);
    });
  },

  onLoad(options) {
    this.sessionStartTime = Date.now();
    this.elapsedOffset = 0;
    this.fatigueChecker = createFatigueChecker();
    this.abortTracked = false;
    this.resumeSaveFailed = false;

    const { courseKey, unitId, wrongItemsOnly, resume, nextType } = options || {};
    if (courseKey) {
      const decodedCourseKey = decodeURIComponent(courseKey);
      this.setData({
        courseKey: decodedCourseKey,
        unitId: unitId ? parseInt(unitId, 10) : null,
        wrongItemsOnly: wrongItemsOnly === "true",
        nextType: nextType || "",
      });

      if (resume === "1" && this.tryResumeSession(decodedCourseKey)) {
        return;
      }

      this.loadQuiz();
    } else {
      this.setData({ loading: false, error: true });
      wx.showToast({
        title: "缺少课程参数",
        icon: "none",
      });
    }
  },

  onShow() {
    studyTimer.start("quiz");
    studyTimer.onInteraction();
  },

  onUserInteraction() {
    studyTimer.onInteraction();
  },

  tryResumeSession(courseKey) {
    const result = getValidResumeSession({ expectedType: "quiz", courseKey, itemsKey: "questions" });
    if (!result) return false;

    const { session, items } = result;
    const questions = items.map(sanitizeQuestion);
    const state = getQuizState(this);
    state.questions = questions;
    const currentIndex = clampIndex(session.currentIndex || 0, questions.length - 1);
    const currentQuestion = questions[currentIndex];
    this.elapsedOffset = session.elapsedSeconds || 0;
    const accuracyPercent = calcAccuracy(
      session.correctCount || 0,
      session.answeredCount || 0,
    );

    this.setData({
      sessionId: session.sessionId || "",
      questionsLength: session.questionsLength || questions.length,
      currentIndex,
      currentQuestion,
      starredItems: session.starredItems || {},
      isStarred: (session.starredItems || {})[currentQuestion.id] || false,
      selectedAnswers: [],
      fillAnswer: "",
      showResult: false,
      answeredCount: session.answeredCount || 0,
      correctCount: session.correctCount || 0,
      loading: false,
      error: false,
      empty: false,
      progressPercent: 0,
      startTime: Date.now(),
      correctIndices: [],
      correctAnswerText: "",
      optionStates: buildOptionStates(currentQuestion?.options || [], [], []),
      questionTypeClass: getQuestionTypeClass(currentQuestion),
      accuracyPercent,
      lastSubmitAt: session.lastSubmitAt || 0,
    });

    this.updateProgress(currentIndex);
    track("session_start", { type: "quiz", resume: true, entry: "resume" });
    return true;
  },

  async loadQuiz() {
    this.setData({ loading: true, error: false, empty: false });

    try {
      const options = {};
      if (this.data.unitId) options.unitId = this.data.unitId;
      if (this.data.wrongItemsOnly) options.wrongItemsOnly = true;

      const res = await startQuiz(this.data.courseKey, options);
      const { sessionId, questions } = res;

      if (!questions || questions.length === 0) {
        const state = getQuizState(this);
        state.questions = [];
        clearResumeSession();
        this.setData({
          loading: false,
          questionsLength: 0,
          empty: true,
        });
        return;
      }

      let starredItems = {};
      try {
        const starredRes = await getStarredItems({
          type: 'question',
          courseKey: this.data.courseKey,
        });
        starredItems = buildQuestionStarredMap(starredRes?.items || []);
      } catch (err) {
        logger.error("Failed to load starred items:", err);
      }

      const state = getQuizState(this);
      state.questions = questions.map(sanitizeQuestion);

      this.setData({
        sessionId,
        questionsLength: state.questions.length,
        currentIndex: 0,
        currentQuestion: state.questions[0],
        starredItems,
        isStarred: starredItems[state.questions[0].id] || false,
        selectedAnswers: [],
        fillAnswer: "",
        showResult: false,
        answeredCount: 0,
        correctCount: 0,
        loading: false,
        progressPercent: 0,
        startTime: Date.now(),
        correctIndices: [],
        correctAnswerText: "",
        optionStates: buildOptionStates(state.questions[0]?.options || [], [], []),
        questionTypeClass: getQuestionTypeClass(state.questions[0]),
        accuracyPercent: 0,
        lastSubmitAt: 0,
      }, () => {
        this.playQuestionEnter();
      });

      this.updateProgress(0);
      this.saveSnapshot();
      track("session_start", { type: "quiz", resume: false, entry: "direct" });
    } catch (err) {
      logger.error("Failed to start quiz:", err);
      this.setData({ loading: false, error: true });
    }
  },

  async toggleStar() {
    const { isStarred, currentQuestion } = this.data;
    if (!currentQuestion) return;
    feedback.tap('light');
    this.cancelAutoAdvance();
    await toggleStarWithOptimisticUpdate({
      page: this,
      currentValue: isStarred,
      itemId: currentQuestion.id,
      updateRemote: (newVal) => (
        newVal
          ? starItem({ type: 'question', questionId: currentQuestion.id, courseKey: this.data.courseKey })
          : unstarItem({ type: 'question', questionId: currentQuestion.id, courseKey: this.data.courseKey })
      ),
      logger,
    });
  },
  
  checkFatigue() {
    this.fatigueChecker.check(this.sessionStartTime);
  },

  selectOption(e) {
    if (this.data.showResult) return;

    const { index } = e.currentTarget.dataset;
    const { currentQuestion } = this.data;
    feedback.tap("light");

    if (currentQuestion.questionType === "MULTI_CHOICE") {
      const selectedAnswers = this.data.selectedAnswers.slice();
      const existingIndex = selectedAnswers.indexOf(index);
      if (existingIndex >= 0) {
        selectedAnswers.splice(existingIndex, 1);
      } else {
        selectedAnswers.push(index);
      }
      this.setData({
        selectedAnswers,
        optionStates: buildOptionStates(currentQuestion.options || [], [], selectedAnswers),
      });
      return;
    }

    this.setData({ selectedAnswers: [index] });
    this.submitAnswer(String(index));
  },

  onFillInput(e) {
    this.setData({ fillAnswer: e.detail.value });
  },

  submitFillAnswer() {
    if (!this.data.fillAnswer) return;
    feedback.tap("light");
    this.submitAnswer(this.data.fillAnswer.trim());
  },

  submitMultiChoice() {
    const { currentQuestion, selectedAnswers } = this.data;
    if (!currentQuestion || !currentQuestion.options) return;

    if (selectedAnswers.length === 0) {
      wx.showToast({
        title: "请选择答案",
        icon: "none",
      });
      return;
    }

    const normalizedIndices = selectedAnswers
      .map((idx) => Number(idx))
      .filter((idx) => Number.isInteger(idx))
      .sort((a, b) => a - b);

    if (normalizedIndices.length === 0) {
      wx.showToast({
        title: "请选择答案",
        icon: "none",
      });
      return;
    }

    this.submitAnswer(normalizedIndices.join("|"));
  },

  async submitAnswer(answer) {
    if (this.data.submitting) return;
    const now = Date.now();
    if (now - (this.data.lastSubmitAt || 0) < 500) return;

    const { currentQuestion, sessionId, startTime } = this.data;
    const durationMs = Date.now() - startTime;

    this.setData({ submitting: true, lastSubmitAt: now });
    
    this.checkFatigue(); // Fatigue Check

    try {
      const result = await submitQuizAnswer(
        sessionId,
        currentQuestion.id,
        answer,
        durationMs,
      );

      const correctIndices = normalizeOptionIndices(result && result.correctOptionIndices);
      const correctAnswerText = formatCorrectAnswer(
        currentQuestion,
        result.correctAnswer,
        correctIndices,
      );
      const explanation = typeof result?.explanation === 'string' ? sanitizeMpHtmlContent(result.explanation) : '';

      const newCorrectCount =
        this.data.correctCount + (result.isCorrect ? 1 : 0);
      const answeredCount = this.data.answeredCount + 1;
      const accuracyPercent = calcAccuracy(newCorrectCount, answeredCount);
      const optionStates = buildOptionStates(
        currentQuestion.options || [],
        correctIndices,
        this.data.selectedAnswers,
      );

      // Show multi-choice hint for first 3 times
      let showQuizHint = false;
      if (currentQuestion.questionType === 'MULTI_CHOICE') {
        const quizHintCount = wx.getStorageSync(QUIZ_HINT_COUNT_KEY);
        const count = typeof quizHintCount === 'number' ? quizHintCount : 0;
        if (count < 3) {
          showQuizHint = true;
        }
      }

      this.setData({
        showResult: true,
        lastResult: {
          isCorrect: !!result.isCorrect,
          explanation,
        },
        correctIndices,
        correctAnswerText: sanitizeMpHtmlContent(correctAnswerText),
        optionStates,
        answeredCount,
        correctCount: newCorrectCount,
        accuracyPercent,
        showQuizHint,
      });

      // 触觉反馈
      if (result.isCorrect) feedback.correct();
      else feedback.wrong();

      // Auto-advance on correct for single/true-false/fill
      if (result.isCorrect && currentQuestion.questionType !== 'MULTI_CHOICE') {
        this.startAutoAdvance();
      }
    } catch (err) {
      logger.error("Failed to submit answer:", err);
      wx.showToast({
        title: "提交失败",
        icon: "none",
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  startAutoAdvance() {
    this.cancelAutoAdvance();
    this.setData({ autoAdvancing: true });
    this._autoAdvanceTimer = setTimeout(() => {
      this._autoAdvanceTimer = null;
      this.setData({ autoAdvancing: false });
      this.nextQuestion();
    }, 1200);
  },

  cancelAutoAdvance() {
    if (this._autoAdvanceTimer) {
      clearTimeout(this._autoAdvanceTimer);
      this._autoAdvanceTimer = null;
    }
    if (this.data.autoAdvancing) {
      this.setData({ autoAdvancing: false });
    }
  },

  nextQuestion() {
    this.cancelAutoAdvance();
    // Increment quiz hint count if hint was shown
    if (this.data.showQuizHint) {
      const quizHintCount = wx.getStorageSync(QUIZ_HINT_COUNT_KEY);
      const count = typeof quizHintCount === 'number' ? quizHintCount : 0;
      wx.setStorageSync(QUIZ_HINT_COUNT_KEY, count + 1);
    }
    const { currentIndex } = this.data;
    const questions = getQuizState(this).questions || [];
    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      const durationSeconds = this.getElapsedSeconds();
      const wrongCount = Math.max(0, questions.length - this.data.correctCount);

      clearResumeSession();
      setLastSessionType("quiz");
      track("session_complete", {
        type: "quiz",
        count: questions.length,
        durationSeconds,
        correctCount: this.data.correctCount,
      });

      const params = [
        `mode=quiz`,
        `count=${questions.length}`,
        `duration=${durationSeconds}`,
        `correct=${this.data.correctCount}`,
        `wrong=${wrongCount}`,
        `courseKey=${encodeURIComponent(this.data.courseKey)}`
      ];
      if (this.data.nextType) {
        params.push(`nextType=${this.data.nextType}`);
      }

      wx.redirectTo({
        url: `/subpackages/review/pages/session-complete/index?${params.join("&")}`,
      });
      return;
    }

    const nextQ = questions[nextIndex];
    this.setData({
      currentIndex: nextIndex,
      currentQuestion: nextQ,
      isStarred: this.data.starredItems[nextQ.id] || false,
      selectedAnswers: [],
      fillAnswer: "",
      showResult: false,
      showQuizHint: false,
      lastResult: null,
      correctIndices: [],
      correctAnswerText: "",
      optionStates: buildOptionStates(nextQ?.options || [], [], []),
      progressPercent: Math.round((nextIndex / this.data.questionsLength) * 100),
      startTime: Date.now(),
      questionTypeClass: getQuestionTypeClass(nextQ),
    }, () => {
      this.playQuestionEnter();
    });

    this.updateProgress(nextIndex);
    this.saveSnapshot();
  },

  retryQuiz() {
    // 重做错题
    getQuizState(this).questions = [];
    this.setData({
      wrongItemsOnly: true,
    });
    this.loadQuiz();
  },

  goBack() {
    this.trackAbort("back");
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({
        url: "/pages/review/index",
      });
    }
  },

  openReportModal() {
    feedback.tap("light");
    this.setData({ showReportModal: true });
  },

  closeReportModal() {
    this.setData({ showReportModal: false });
  },

  onReportSuccess() {
    // 反馈提交成功后的回调
  },

  onHide() {
    this.trackAbort("hide");
    studyTimer.flush();
    studyTimer.stop();
  },

  onFeedback() {
    wx.navigateTo({
      url: "/pages/customer-service/index",
    });
  },

  updateProgress(currentIndex) {
    const total = this.data.questionsLength || 0;
    const remaining = Math.max(0, total - currentIndex);
    const remainingMinutes = Math.ceil((remaining * QUIZ_SECONDS_PER_ITEM) / 60);
    this.setData({
      progressPercent: total > 0 ? Math.round((currentIndex / total) * 100) : 0,
      remainingMinutes,
    });
  },

  saveSnapshot() {
    if (!this.data.sessionId || this.resumeSaveFailed) return;
    const state = getQuizState(this);
    const saved = saveResumeSession({
      type: "quiz",
      courseKey: this.data.courseKey,
      unitId: this.data.unitId,
      sessionId: this.data.sessionId,
      questions: state.questions,
      questionsLength: this.data.questionsLength,
      currentIndex: this.data.currentIndex,
      starredItems: this.data.starredItems,
      answeredCount: this.data.answeredCount,
      correctCount: this.data.correctCount,
      wrongItemsOnly: this.data.wrongItemsOnly,
      elapsedSeconds: this.getElapsedSeconds(),
      lastSubmitAt: this.data.lastSubmitAt || 0,
    });
    if (!saved) {
      this.resumeSaveFailed = true;
      logger.warn("[study-session] quiz snapshot save skipped");
    }
  },

  getElapsedSeconds() {
    return this.elapsedOffset + Math.floor((Date.now() - this.sessionStartTime) / 1000);
  },

  trackAbort(reason) {
    if (this.abortTracked || !this.data.sessionId) return;
    this.abortTracked = true;
    this.saveSnapshot();
    track("session_abort", {
      type: "quiz",
      reason,
    });
  },

  onUnload() {
    this.cancelAutoAdvance();
    this.trackAbort("close");
    studyTimer.flush();
    studyTimer.stop();
    const state = getQuizState(this);
    if (state.questionEnterTimer) {
      clearTimeout(state.questionEnterTimer);
      state.questionEnterTimer = null;
    }
    state.questions = [];
    clearPageState("review.quiz", this);
  },

  onShareAppMessage() {
    return {
      title: "一起来刷题吧",
      path: "/pages/review/index",
    };
  },
});

function formatCorrectAnswer(question, correctAnswer, correctIndices = []) {
  if (question && Array.isArray(question.options) && correctIndices.length > 0) {
    const answerTexts = correctIndices
      .map((idx) => (Number.isInteger(idx) ? question.options[idx] : undefined))
      .filter((option) => typeof option === "string")
      .map((option) => String(option).trim())
      .filter(Boolean);
    const uniqueAnswers = Array.from(new Set(answerTexts));
    if (uniqueAnswers.length > 0) {
      return uniqueAnswers.join(", ");
    }
  }

  if (typeof correctAnswer === "string") {
    return correctAnswer.trim();
  }

  return "";
}

/**
 * 为 WXML 构建选项状态数组
 */
function buildOptionStates(options, correctIndices, selectedAnswers) {
  const correctSet = new Set(correctIndices);
  const selectedSet = new Set(selectedAnswers);

  return options.map((_, idx) => {
    const isCorrect = correctSet.has(idx);
    const isSelected = selectedSet.has(idx);
    const isWrong = isSelected && !isCorrect;
    return { isCorrect, isWrong, isSelected };
  });
}

function buildQuestionStarredMap(items) {
  return items.reduce((acc, item) => {
    if (item && item.type === 'question' && Number.isInteger(item.questionId)) {
      acc[item.questionId] = true;
    }
    return acc;
  }, {});
}

function getQuestionTypeClass(question) {
  return question && question.questionType
    ? String(question.questionType).toLowerCase()
    : "";
}

function calcAccuracy(correctCount, answeredCount) {
  if (!answeredCount) return 0;
  return Math.round((correctCount / answeredCount) * 100);
}

function normalizeOptionIndices(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const v of input) {
    const n = Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function sanitizeQuestion(q) {
  if (!q || typeof q !== 'object') return q;
  const stem = typeof q.stem === 'string' ? sanitizeMpHtmlContent(q.stem) : '';
  const options = Array.isArray(q.options)
    ? q.options.map((opt) => (typeof opt === 'string' ? sanitizeMpHtmlContent(opt) : ''))
    : [];
  const explanation = typeof q.explanation === 'string' ? sanitizeMpHtmlContent(q.explanation) : undefined;
  return { ...q, stem, options, ...(explanation === undefined ? {} : { explanation }) };
}

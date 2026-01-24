// subpackages/review/pages/quiz/index.js
// 刷题闯关页

const { startQuiz, submitQuizAnswer, starItem, unstarItem, getStarredItems } = require("../../utils/study-api");
const { getResumeSession, saveResumeSession, clearResumeSession, setLastSessionType } = require("../../utils/study-session");
const studyTimer = require("../../utils/study-timer");
const logger = require("../../../../utils/logger");
const { track } = require("../../../../utils/track");
const feedback = require("../../../../utils/ui/feedback");

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
  },

  onLoad(options) {
    this.sessionStartTime = Date.now();
    this.elapsedOffset = 0;
    this.fatigueWarned = false;
    this.abortTracked = false;

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
    const session = getResumeSession();
    if (!session || session.type !== "quiz" || session.courseKey !== courseKey) {
      return false;
    }
    const questions = session.questions || [];
    if (!Array.isArray(questions) || questions.length === 0) {
      return false;
    }

    this._questions = questions;
    const currentIndex = Math.min(session.currentIndex || 0, questions.length - 1);
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
        this._questions = [];
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

      this._questions = questions;

      this.setData({
        sessionId,
        questionsLength: questions.length,
        currentIndex: 0,
        currentQuestion: questions[0],
        starredItems,
        isStarred: starredItems[questions[0].id] || false,
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
        optionStates: buildOptionStates(questions[0]?.options || [], [], []),
        questionTypeClass: getQuestionTypeClass(questions[0]),
        accuracyPercent: 0,
      });

      this.updateProgress(0);
      this.saveSnapshot();
      track("session_start", { type: "quiz", resume: false, entry: "direct" });
    } catch (err) {
      logger.error("Failed to start quiz:", err);
      this.setData({ loading: false, error: true });
    }
  },

  toggleStar() {
     const { isStarred, currentQuestion, starredItems } = this.data;
     if (!currentQuestion) return;

     const newVal = !isStarred;
     const qId = currentQuestion.id;

     feedback.tap('light');
     this.setData({ isStarred: newVal });

     const updatePromise = newVal
       ? starItem({ type: 'question', questionId: qId })
       : unstarItem({ type: 'question', questionId: qId });

     updatePromise
       .then(() => {
         starredItems[qId] = newVal;
         if (!newVal) delete starredItems[qId];
         this.setData({ starredItems });
       })
       .catch((err) => {
         logger.error("Failed to update star:", err);
         this.setData({ isStarred: !newVal });
         wx.showToast({
           title: "星标同步失败",
           icon: "none",
         });
       });
  },
  
  checkFatigue() {
      if (this.fatigueWarned) return;
      
      const elapsed = Date.now() - this.sessionStartTime;
      if (elapsed > 15 * 60 * 1000) { // 15 mins
          this.fatigueWarned = true;
          wx.showModal({
              title: '休息一下',
              content: '已经学习很久了，休息一下眼睛吧，我会帮你保存进度。',
              showCancel: false,
              confirmText: '我知道了'
          });
      }
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

    const optionText = currentQuestion.options
      ? currentQuestion.options[index]
      : "";
    this.submitAnswer(String(optionText).trim());
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

    const answerTexts = currentQuestion.options
      .map((option, idx) =>
        selectedAnswers.indexOf(idx) !== -1 ? option : null,
      )
      .filter((option) => option !== null)
      .map((option) => String(option).trim());

    this.submitAnswer(answerTexts.join("|"));
  },

  async submitAnswer(answer) {
    // 防重复提交
    if (this.data.submitting) return;

    const { currentQuestion, sessionId, startTime } = this.data;
    const durationMs = Date.now() - startTime;

    this.setData({ submitting: true });
    
    this.checkFatigue(); // Fatigue Check

    try {
      const result = await submitQuizAnswer(
        sessionId,
        currentQuestion.id,
        answer,
        durationMs,
      );

      const optionsLength = Array.isArray(currentQuestion.options)
        ? currentQuestion.options.length
        : 0;
      const serverIndices = normalizeIndices(
        result.correctOptionIndices,
        optionsLength,
      );
      const localIndices = normalizeIndices(
        getCorrectIndices(currentQuestion, result.correctAnswer),
        optionsLength,
      );
      const correctIndices = pickCorrectIndices(
        currentQuestion.questionType,
        localIndices,
        serverIndices,
      );
      const correctAnswerText = formatCorrectAnswer(
        currentQuestion,
        result.correctAnswer,
      );

      const newCorrectCount =
        this.data.correctCount + (result.isCorrect ? 1 : 0);
      const answeredCount = this.data.answeredCount + 1;
      const accuracyPercent = calcAccuracy(newCorrectCount, answeredCount);
      const optionStates = buildOptionStates(
        currentQuestion.options || [],
        correctIndices,
        this.data.selectedAnswers,
      );

      this.setData({
        showResult: true,
        lastResult: result,
        correctIndices,
        correctAnswerText,
        optionStates,
        answeredCount,
        correctCount: newCorrectCount,
        accuracyPercent,
      });

      // 触觉反馈
      if (result.isCorrect) feedback.correct();
      else feedback.wrong();
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

  nextQuestion() {
    const { currentIndex } = this.data;
    const questions = this._questions || [];
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
      lastResult: null,
      correctIndices: [],
      correctAnswerText: "",
      optionStates: buildOptionStates(nextQ?.options || [], [], []),
      progressPercent: Math.round((nextIndex / this.data.questionsLength) * 100),
      startTime: Date.now(),
      questionTypeClass: getQuestionTypeClass(nextQ),
    });

    this.updateProgress(nextIndex);
    this.saveSnapshot();
  },

  retryQuiz() {
    // 重做错题
    this._questions = [];
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
    const remainingMinutes = Math.ceil((remaining * 30) / 60);
    this.setData({
      progressPercent: total > 0 ? Math.round((currentIndex / total) * 100) : 0,
      remainingMinutes,
    });
  },

  saveSnapshot() {
    if (!this.data.sessionId) return;
    saveResumeSession({
      type: "quiz",
      courseKey: this.data.courseKey,
      unitId: this.data.unitId,
      sessionId: this.data.sessionId,
      questions: this._questions,
      questionsLength: this.data.questionsLength,
      currentIndex: this.data.currentIndex,
      starredItems: this.data.starredItems,
      answeredCount: this.data.answeredCount,
      correctCount: this.data.correctCount,
      wrongItemsOnly: this.data.wrongItemsOnly,
      elapsedSeconds: this.getElapsedSeconds(),
    });
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
    this.trackAbort("close");
    studyTimer.flush();
    studyTimer.stop();
  },

  onShareAppMessage() {
    return {
      title: "一起来刷题吧",
      path: "/pages/review/index",
    };
  },
});

function getCorrectIndices(question, correctAnswer) {
  if (
    !question ||
    !question.options ||
    question.questionType === "FILL_BLANK"
  ) {
    return [];
  }

  const options = question.options;
  const correctAnswers =
    question.questionType === "MULTI_CHOICE"
      ? parseAnswerList(correctAnswer)
      : [correctAnswer];

  const indices = [];
  correctAnswers.forEach((answer) => {
    const normalizedAnswer = normalizeAnswerToken(answer);
    const idx = options.findIndex(
      (option) => normalizeAnswerToken(String(option)) === normalizedAnswer,
    );
    if (idx >= 0) indices.push(idx);
  });

  return Array.from(new Set(indices));
}

function formatCorrectAnswer(question, correctAnswer) {
  if (!question || question.questionType !== "MULTI_CHOICE") {
    return correctAnswer;
  }

  const answers = parseAnswerList(correctAnswer);
  return answers.join(", ");
}

function parseAnswerList(answer) {
  const trimmed = String(answer || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter((item) => item.length > 0);
      }
    } catch {
      // Fall back to pipe parsing.
    }
  }

  if (trimmed.includes("|")) {
    return trimmed
      .split("|")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [trimmed];
}

function normalizeAnswerToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeIndices(indices, maxLength) {
  if (maxLength <= 0) return [];
  let source = indices;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          source = parsed;
        }
      } catch {
        source = trimmed;
      }
    }
    if (typeof source === "string") {
      if (trimmed.includes(",")) {
        source = trimmed.split(",");
      } else if (trimmed.includes("|")) {
        source = trimmed.split("|");
      } else {
        source = [trimmed];
      }
    }
  }
  if (!Array.isArray(source)) return [];
  const normalized = source
    .map((value) => Number(value))
    .filter(
      (value) => Number.isInteger(value) && value >= 0 && value < maxLength,
    );
  return Array.from(new Set(normalized));
}

function pickCorrectIndices(questionType, localIndices, serverIndices) {
  if (questionType === "MULTI_CHOICE") {
    return serverIndices.length > 0 ? serverIndices : localIndices;
  }

  if (serverIndices.length > 0) {
    if (serverIndices.length > 1) {
      return [Math.min(...serverIndices)];
    }
    return serverIndices;
  }

  if (localIndices.length > 1) {
    return [Math.min(...localIndices)];
  }

  return localIndices;
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

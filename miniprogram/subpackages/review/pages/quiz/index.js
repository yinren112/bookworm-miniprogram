// subpackages/review/pages/quiz/index.js
// 刷题闯关页

const { startQuiz, submitQuizAnswer } = require("../../utils/study-api");

Page({
  data: {
    loading: true,
    submitting: false, // 防重复提交
    courseKey: "",
    unitId: null,
    wrongItemsOnly: false,
    sessionId: "",
    questions: [],
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
    completed: false,
    progressPercent: 0,
    startTime: 0,
    // 常量
    questionTypeLabels: {
      SINGLE_CHOICE: "单选题",
      MULTI_CHOICE: "多选题",
      TRUE_FALSE: "判断题",
      FILL_BLANK: "填空题",
    },
    optionLabels: ["A", "B", "C", "D", "E", "F"],
    showReportModal: false,
  },

  onLoad(options) {
    const { courseKey, unitId, wrongItemsOnly } = options;
    if (courseKey) {
      this.setData({
        courseKey: decodeURIComponent(courseKey),
        unitId: unitId ? parseInt(unitId, 10) : null,
        wrongItemsOnly: wrongItemsOnly === "true",
      });
      this.loadQuiz();
    } else {
      this.setData({ loading: false });
      wx.showToast({
        title: "缺少课程参数",
        icon: "none",
      });
    }
  },

  async loadQuiz() {
    this.setData({ loading: true });

    try {
      const options = {};
      if (this.data.unitId) options.unitId = this.data.unitId;
      if (this.data.wrongItemsOnly) options.wrongItemsOnly = true;

      const res = await startQuiz(this.data.courseKey, options);
      const { sessionId, questions } = res;

      if (!questions || questions.length === 0) {
        this.setData({
          loading: false,
          questions: [],
        });
        return;
      }

      this.setData({
        sessionId,
        questions,
        currentIndex: 0,
        currentQuestion: questions[0],
        selectedAnswers: [],
        fillAnswer: "",
        showResult: false,
        answeredCount: 0,
        correctCount: 0,
        completed: false,
        loading: false,
        progressPercent: 0,
        startTime: Date.now(),
        correctIndices: [],
        correctAnswerText: "",
        optionStates: buildOptionStates(questions[0]?.options || [], [], []),
      });
    } catch (err) {
      console.error("Failed to start quiz:", err);
      this.setData({ loading: false });
      wx.showToast({
        title: "加载失败",
        icon: "none",
      });
    }
  },

  selectOption(e) {
    if (this.data.showResult) return;

    const { index } = e.currentTarget.dataset;
    const { currentQuestion } = this.data;
    wx.vibrateShort({ type: "light" });

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
    wx.vibrateShort({ type: "light" });
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
      logQuizDebug({
        questionId: currentQuestion.id,
        questionType: currentQuestion.questionType,
        options: currentQuestion.options,
        optionsLength,
        result,
        serverIndices,
        localIndices,
        correctIndices,
      });

      const newCorrectCount =
        this.data.correctCount + (result.isCorrect ? 1 : 0);
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
        answeredCount: this.data.answeredCount + 1,
        correctCount: newCorrectCount,
      });

      // 触觉反馈
      wx.vibrateShort({ type: result.isCorrect ? "light" : "medium" });
    } catch (err) {
      console.error("Failed to submit answer:", err);
      wx.showToast({
        title: "提交失败",
        icon: "none",
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  nextQuestion() {
    const { currentIndex, questions } = this.data;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      // 完成所有题目
      this.setData({
        completed: true,
        progressPercent: 100,
      });
      return;
    }

    this.setData({
      currentIndex: nextIndex,
      currentQuestion: questions[nextIndex],
      selectedAnswers: [],
      fillAnswer: "",
      showResult: false,
      lastResult: null,
      correctIndices: [],
      correctAnswerText: "",
      optionStates: buildOptionStates(questions[nextIndex]?.options || [], [], []),
      progressPercent: Math.round((nextIndex / questions.length) * 100),
      startTime: Date.now(),
    });
  },

  retryQuiz() {
    // 重做错题
    this.setData({
      wrongItemsOnly: true,
    });
    this.loadQuiz();
  },

  goBack() {
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
    wx.vibrateShort({ type: "light" });
    this.setData({ showReportModal: true });
  },

  closeReportModal() {
    this.setData({ showReportModal: false });
  },

  onReportSuccess() {
    // 反馈提交成功后的回调
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
 * 为 WXML 构建选项状态数组，避免在模板中使用 indexOf
 * @param {Array} options - 选项列表
 * @param {Array} correctIndices - 正确答案索引
 * @param {Array} selectedAnswers - 用户选中的索引
 * @returns {Array} 包含 isCorrect/isWrong/isSelected 的状态数组
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

function logQuizDebug(payload) {
  try {
    const env = wx.getAccountInfoSync().miniProgram.envVersion;
    if (env !== "release") {
      console.log("[QUIZ_UI_DEBUG]", payload);
    }
  } catch {
    // Ignore logging errors in older environments.
  }
}

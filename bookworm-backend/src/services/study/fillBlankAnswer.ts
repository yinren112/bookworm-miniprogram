export type FillBlankIssueSeverity = "high" | "medium";

export interface FillBlankInputIssue {
  code:
    | "POSSIBLE_MISCLASSIFIED_CHOICE"
    | "PLACEHOLDER_ANSWER"
    | "LATEX_COMMAND"
    | "POWER_OR_SUBSCRIPT"
    | "SPECIAL_MATH_SYMBOL"
    | "BRACKET_HEAVY"
    | "ANSWER_TOO_LONG"
    | "EXPRESSION_TOO_COMPLEX";
  message: string;
  severity: FillBlankIssueSeverity;
}

const LATEX_COMMAND_RE = /\\[a-zA-Z]+/;
const POWER_OR_SUBSCRIPT_RE = /[\^_]|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ₀₁₂₃₄₅₆₇₈₉]/u;
const SPECIAL_MATH_SYMBOL_RE = /[≤≥≠≈∞∫∑√∂∇αβγδθλμπω]/u;
const BRACKET_HEAVY_RE = /[[\]{}]/;
const OPERATOR_RE = /[+\-*/=<>]/g;

const SUPERSCRIPT_MAP: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁺": "+",
  "⁻": "-",
  "⁼": "=",
  "⁽": "(",
  "⁾": ")",
  "ⁿ": "n",
};

const SUBSCRIPT_MAP: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

const TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/（/g, "("],
  [/）/g, ")"],
  [/【/g, "["],
  [/】/g, "]"],
  [/｛/g, "{"],
  [/｝/g, "}"],
  [/，/g, ","],
  [/。/g, "."],
  [/：/g, ":"],
  [/；/g, ";"],
  [/＋/g, "+"],
  [/－/g, "-"],
  [/×/g, "*"],
  [/÷/g, "/"],
  [/＝/g, "="],
  [/−|–|—/g, "-"],
  [/·|⋅/g, "*"],
  [/π/g, "pi"],
  [/∞/g, "infinity"],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/≠/g, "!="],
  [/≈/g, "~="],
  [/√/g, "sqrt"],
  [/∑/g, "sum"],
  [/∫/g, "int"],
  [/∂/g, "d"],
];

const LATEX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\left/g, ""],
  [/\\right/g, ""],
  [/\\cdot|\\times/g, "*"],
  [/\\div/g, "/"],
  [/\\leq?/g, "<="],
  [/\\geq?/g, ">="],
  [/\\neq/g, "!="],
  [/\\infty/g, "infinity"],
  [/\\pi/g, "pi"],
  [/\\sqrt/g, "sqrt"],
  [/\\ln/g, "ln"],
  [/\\exp/g, "exp"],
  [/\\,/g, ""],
];

function normalizeLatexFraction(input: string): string {
  let output = input;
  let prev = "";
  const fracPattern = /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g;
  while (output !== prev) {
    prev = output;
    output = output.replace(fracPattern, "($1)/($2)");
  }
  return output;
}

function normalizeExpNotation(input: string): string {
  let output = input;
  output = output.replace(/\be\^\(([^()]+)\)/g, "exp($1)");
  output = output.replace(/\be\^([a-z0-9.+\-*/]+)/gi, "exp($1)");
  return output;
}

function stripMathDelimiters(input: string): string {
  let output = input.trim();
  while (output.length >= 2 && output.startsWith("$") && output.endsWith("$")) {
    output = output.slice(1, -1).trim();
  }
  return output.replace(/\$/g, "");
}

function normalizeSuperAndSubScripts(input: string): string {
  let output = "";
  for (const ch of input) {
    if (Object.prototype.hasOwnProperty.call(SUPERSCRIPT_MAP, ch)) {
      output += SUPERSCRIPT_MAP[ch];
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(SUBSCRIPT_MAP, ch)) {
      output += SUBSCRIPT_MAP[ch];
      continue;
    }
    output += ch;
  }
  return output;
}

function unwrapOuterParentheses(input: string): string {
  let output = input.trim();
  while (
    output.length >= 2 &&
    output.startsWith("(") &&
    output.endsWith(")") &&
    isBalanced(output.slice(1, -1))
  ) {
    output = output.slice(1, -1).trim();
  }
  return output;
}

function isBalanced(input: string): boolean {
  let depth = 0;
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function splitFillBlankAnswers(answer: string): string[] {
  return String(answer || "")
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function extractLegacyChoiceOptionsFromFillBlank(answer: string): string[] | null {
  const answerLines = String(answer || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (answerLines.length < 2) return null;

  if (answerLines.every((line) => line.startsWith("="))) {
    const options = answerLines.map((line) => line.substring(1).trim()).filter(Boolean);
    return options.length >= 2 ? options : null;
  }

  if (!answerLines[0].startsWith("=") && answerLines.slice(1).every((line) => line.startsWith("="))) {
    const options = [
      answerLines[0],
      ...answerLines.slice(1).map((line) => line.substring(1).trim()),
    ].filter(Boolean);
    return options.length >= 2 ? options : null;
  }

  return null;
}

export function normalizeFillBlankAnswerToken(value: string): string {
  let normalized = stripMathDelimiters(String(value || ""));

  normalized = normalizeSuperAndSubScripts(normalized);
  normalized = normalizeLatexFraction(normalized);

  for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of LATEX_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized.replace(/[{}]/g, (token) => (token === "{" ? "(" : ")"));
  normalized = normalized.replace(/\s+/g, "");
  normalized = normalized.toLowerCase();
  normalized = normalizeExpNotation(normalized);

  if (normalized.startsWith("exp(") && normalized.endsWith(")")) {
    const inner = unwrapOuterParentheses(normalized.slice(4, -1));
    return `exp(${inner})`;
  }

  return normalized;
}

export function getFillBlankComparableTokens(value: string): Set<string> {
  const normalized = normalizeFillBlankAnswerToken(value);
  const tokens = new Set<string>();
  if (!normalized) return tokens;

  tokens.add(normalized);

  const expMatch = normalized.match(/^exp\((.+)\)$/);
  if (expMatch) {
    const inner = unwrapOuterParentheses(expMatch[1]);
    tokens.add(`e^${inner}`);
  }

  const powerMatch = normalized.match(/^e\^(.+)$/);
  if (powerMatch) {
    const inner = unwrapOuterParentheses(powerMatch[1]);
    tokens.add(`exp(${inner})`);
  }

  return tokens;
}

function inspectFillBlankToken(token: string): FillBlankInputIssue["code"][] {
  const trimmed = token.trim();
  if (!trimmed) return [];

  const issueCodes: FillBlankInputIssue["code"][] = [];

  if (LATEX_COMMAND_RE.test(trimmed)) {
    issueCodes.push("LATEX_COMMAND");
  }
  if (POWER_OR_SUBSCRIPT_RE.test(trimmed)) {
    issueCodes.push("POWER_OR_SUBSCRIPT");
  }
  if (SPECIAL_MATH_SYMBOL_RE.test(trimmed)) {
    issueCodes.push("SPECIAL_MATH_SYMBOL");
  }
  if (BRACKET_HEAVY_RE.test(trimmed)) {
    issueCodes.push("BRACKET_HEAVY");
  }
  if (trimmed.length > 36) {
    issueCodes.push("ANSWER_TOO_LONG");
  }

  const operators = trimmed.match(OPERATOR_RE);
  if ((operators?.length || 0) >= 4) {
    issueCodes.push("EXPRESSION_TOO_COMPLEX");
  }

  return issueCodes;
}

const ISSUE_MAP: Record<FillBlankInputIssue["code"], Omit<FillBlankInputIssue, "code">> = {
  POSSIBLE_MISCLASSIFIED_CHOICE: {
    message: "疑似将选择题错误导入为填空题（答案为多行 = 选项）",
    severity: "high",
  },
  PLACEHOLDER_ANSWER: {
    message: "答案是占位符，题目不可用",
    severity: "high",
  },
  LATEX_COMMAND: {
    message: "包含 LaTeX 命令，手机端输入成本高",
    severity: "high",
  },
  POWER_OR_SUBSCRIPT: {
    message: "包含幂/下标写法，手机端输入不便",
    severity: "high",
  },
  SPECIAL_MATH_SYMBOL: {
    message: "包含非常用数学符号，手机端输入不便",
    severity: "high",
  },
  BRACKET_HEAVY: {
    message: "包含大量括号/花括号，手机端输入不便",
    severity: "medium",
  },
  ANSWER_TOO_LONG: {
    message: "答案过长，不适合填空输入",
    severity: "medium",
  },
  EXPRESSION_TOO_COMPLEX: {
    message: "表达式过于复杂，不适合手机填空输入",
    severity: "medium",
  },
};

export function collectFillBlankInputIssues(answer: string): FillBlankInputIssue[] {
  const answerText = String(answer || "");
  if (answerText.includes("答案占位符")) {
    return [
      {
        code: "PLACEHOLDER_ANSWER",
        message: ISSUE_MAP.PLACEHOLDER_ANSWER.message,
        severity: ISSUE_MAP.PLACEHOLDER_ANSWER.severity,
      },
    ];
  }

  if (extractLegacyChoiceOptionsFromFillBlank(answer)) {
    return [
      {
        code: "POSSIBLE_MISCLASSIFIED_CHOICE",
        message: ISSUE_MAP.POSSIBLE_MISCLASSIFIED_CHOICE.message,
        severity: ISSUE_MAP.POSSIBLE_MISCLASSIFIED_CHOICE.severity,
      },
    ];
  }

  const answerTokens = splitFillBlankAnswers(answer);
  if (answerTokens.length === 0) return [];

  const tokenIssues = answerTokens.map((token) => inspectFillBlankToken(token));
  const hasEasyAlias = tokenIssues.some((codes) => codes.length === 0);
  if (hasEasyAlias) {
    return [];
  }

  const dedup = new Set<FillBlankInputIssue["code"]>();
  for (const codes of tokenIssues) {
    for (const code of codes) {
      dedup.add(code);
    }
  }

  return Array.from(dedup).map((code) => ({
    code,
    message: ISSUE_MAP[code].message,
    severity: ISSUE_MAP[code].severity,
  }));
}

const { getResumeSession } = require('./study-session');

function getValidResumeSession(params) {
  const { expectedType, courseKey, itemsKey } = params || {};
  if (!expectedType || !courseKey || !itemsKey) return null;

  const session = getResumeSession();
  if (!session || session.type !== expectedType || session.courseKey !== courseKey) {
    return null;
  }
  const items = session[itemsKey] || [];
  if (!Array.isArray(items) || items.length === 0) return null;

  return { session, items };
}

function clampIndex(index, maxIndex) {
  const n = Number(index);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > maxIndex) return maxIndex;
  return Math.floor(n);
}

module.exports = {
  getValidResumeSession,
  clampIndex,
};


function extractErrorMessage(error, fallback = '发生未知错误') {
  if (!error) {
    return fallback;
  }
  if (typeof error === 'string') {
    return error;
  }

  const message =
    error.message ||
    (error.data && error.data.message) ||
    error.error ||
    fallback;

  return typeof message === 'string' && message.trim() ? message : fallback;
}

module.exports = {
  extractErrorMessage,
};

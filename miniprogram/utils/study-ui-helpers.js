async function toggleStarWithOptimisticUpdate(params) {
  const {
    page,
    currentValue,
    itemId,
    updateRemote,
    logger,
    toastTitle = '星标同步失败',
  } = params || {};

  if (!page || !itemId || typeof updateRemote !== 'function') return;

  const newVal = !currentValue;
  page.setData({ isStarred: newVal });

  try {
    await updateRemote(newVal);
    const nextStarredItems = { ...(page.data.starredItems || {}) };
    if (newVal) nextStarredItems[itemId] = true;
    else delete nextStarredItems[itemId];
    page.setData({ starredItems: nextStarredItems });
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Failed to update star:', err);
    }
    page.setData({ isStarred: currentValue });
    wx.showToast({ title: toastTitle, icon: 'none' });
  }
}

module.exports = {
  toggleStarWithOptimisticUpdate,
};


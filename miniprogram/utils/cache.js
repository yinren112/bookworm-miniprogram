// miniprogram/utils/cache.js - SWR (stale-while-revalidate) 缓存工具
const logger = require('./logger');

/**
 * 从本地存储获取缓存项（同步版本）
 * @param {string} key - 缓存键
 * @returns {Object|null} - { data, timestamp } 或 null
 */
function get(key) {
  try {
    const raw = wx.getStorageSync(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    logger.error('[cache] get failed', key, error);
    return null;
  }
}

/**
 * 从本地存储获取缓存项（异步版本，避免阻塞主线程）
 * @param {string} key - 缓存键
 * @returns {Promise<Object|null>} - { data, timestamp } 或 null
 */
function getAsync(key) {
  return new Promise((resolve) => {
    wx.getStorage({
      key,
      success: (res) => {
        try {
          resolve(res.data ? JSON.parse(res.data) : null);
        } catch {
          resolve(null);
        }
      },
      fail: () => resolve(null)
    });
  });
}

/**
 * 设置缓存项（带 TTL）
 * @param {string} key - 缓存键
 * @param {*} data - 缓存数据
 * @param {number} ttlMs - 过期时间（毫秒）
 */
function setWithTTL(key, data, ttlMs) {
  try {
    const item = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    };
    wx.setStorage({
      key,
      data: JSON.stringify(item),
      fail: (err) => {
        logger.error('[cache] setStorage failed', key, err);
      }
    });
  } catch (error) {
    logger.error('[cache] setWithTTL failed', key, error);
  }
}

/**
 * 检查缓存是否过期
 * @param {Object} cachedItem - { data, timestamp, ttl }
 * @returns {boolean}
 */
function isExpired(cachedItem) {
  if (!cachedItem || !cachedItem.timestamp || !cachedItem.ttl) {
    return true;
  }
  const age = Date.now() - cachedItem.timestamp;
  return age > cachedItem.ttl;
}

/**
 * SWR 缓存策略：先返回缓存（如果未过期），并行后台刷新
 * @param {string} key - 缓存键
 * @param {Function} fetcher - 数据获取函数（返回 Promise）
 * @param {Object} options - 选项
 * @param {number} options.ttlMs - 缓存 TTL（默认 30 秒）
 * @param {boolean} options.forceRefresh - 强制刷新（忽略缓存）
 * @param {Function} options.onBackgroundUpdate - 后台刷新成功回调
 * @returns {Promise<*>} - 返回数据（缓存或新数据）
 */
async function swrFetch(key, fetcher, { ttlMs = 30000, forceRefresh = false, onBackgroundUpdate = null } = {}) {
  const cached = await getAsync(key);

  // 如果强制刷新，直接拉新数据
  if (forceRefresh) {
    try {
      const freshData = await fetcher();
      setWithTTL(key, freshData, ttlMs);
      return freshData;
    } catch (error) {
      // 强制刷新失败，如果有缓存就返回缓存
      if (cached && cached.data) {
        return cached.data;
      }
      throw error;
    }
  }

  // 如果缓存有效，先返回缓存
  if (cached && !isExpired(cached)) {
    // 后台刷新（不阻塞当前返回）
    fetcher()
      .then(freshData => {
        setWithTTL(key, freshData, ttlMs);
        // 通知调用方后台更新完成
        if (onBackgroundUpdate && typeof onBackgroundUpdate === 'function') {
          onBackgroundUpdate(freshData);
        }
      })
      .catch(() => {
        // 后台刷新失败，静默处理
      });

    return cached.data;
  }

  // 无缓存或缓存过期，直接拉新数据
  try {
    const freshData = await fetcher();
    setWithTTL(key, freshData, ttlMs);
    return freshData;
  } catch (error) {
    // 拉新失败，如果有缓存（即使过期）也返回
    if (cached && cached.data) {
      return cached.data;
    }
    throw error;
  }
}

/**
 * 清除指定缓存
 * @param {string} key - 缓存键
 */
function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (error) {
    logger.error('[cache] remove failed', key, error);
  }
}

/**
 * 清除所有缓存
 */
function clear() {
  try {
    wx.clearStorageSync();
  } catch (error) {
    logger.error('[cache] clear failed', error);
  }
}

module.exports = {
  get,
  getAsync,
  setWithTTL,
  swrFetch,
  remove,
  clear
};

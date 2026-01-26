const { getLocalContentBySlug } = require('./local-content');

async function resolveContentWithFallback(slug, fetchRemote) {
  if (!slug || typeof slug !== 'string') {
    throw new Error('slug required');
  }
  if (typeof fetchRemote !== 'function') {
    throw new Error('fetchRemote required');
  }

  try {
    const data = await fetchRemote(slug);
    if (!data || typeof data !== 'object') {
      throw new Error('invalid content response');
    }
    const title = typeof data.title === 'string' ? data.title : '';
    const body = typeof data.body === 'string' ? data.body : '';
    if (!title || !body) {
      throw new Error('invalid content fields');
    }
    return { source: 'remote', title, body };
  } catch (err) {
    const local = getLocalContentBySlug(slug);
    if (local) {
      return { source: 'local', title: local.title, body: local.body };
    }
    throw err;
  }
}

module.exports = {
  resolveContentWithFallback,
};


const namespaces = Object.create(null);

function getNamespace(namespace) {
  let map = namespaces[namespace];
  if (!map) {
    map = typeof WeakMap === "function" ? new WeakMap() : new Map();
    namespaces[namespace] = map;
  }
  return map;
}

function getPageState(namespace, page, init) {
  const map = getNamespace(namespace);
  let state = map.get(page);
  if (!state) {
    state = typeof init === "function" ? init() : {};
    map.set(page, state);
  }
  return state;
}

function clearPageState(namespace, page) {
  const map = getNamespace(namespace);
  map.delete(page);
}

module.exports = {
  getPageState,
  clearPageState,
};


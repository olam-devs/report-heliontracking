module.exports = {
  info: (...args) => console.log('[tracking]', ...args),
  warn: (...args) => console.warn('[tracking]', ...args),
  error: (...args) => console.error('[tracking]', ...args),
  debug: () => {},
};

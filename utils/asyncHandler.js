// Wraps an async route/middleware function so any rejected promise
// or thrown error is forwarded to Express's error-handling middleware,
// instead of needing a try/catch in every controller.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

function errorHandler(err, req, res, next) {
  console.error('[ARALYTICS SERVER ERROR]', {
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error occurred within Aralytics Engine.',
    code: err.code || 'INTERNAL_ERROR'
  });
}

module.exports = errorHandler;

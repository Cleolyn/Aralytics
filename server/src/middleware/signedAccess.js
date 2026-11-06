const tokens = require('../services/fileTokens');
const { verifyToken } = require('./auth');

/**
 * Download guard for older (pre-chunked) uploads. A valid signed ?sig= is the credential;
 * without one the caller must be signed in. `kind` is 'materials' or 'performance-tasks'.
 */
function signedOrAuthenticated(kind) {
  return (req, res, next) => {
    if (req.query.sig === undefined) return verifyToken(req, res, next);
    const env = req.app?.locals?.env || {};
    const claims = tokens.verify(env, String(req.query.sig), { a: 'd', f: `legacy:${kind}/${req.params.filename}` });
    if (!claims) return res.status(403).json({ success: false, message: 'This link expired. Reopen the file.' });
    req.signedAccess = claims;
    next();
  };
}

module.exports = { signedOrAuthenticated };

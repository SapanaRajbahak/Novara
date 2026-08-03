function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (process.env.STRIPE_DEBUG === '1' && req.originalUrl?.startsWith('/api/billing/')) {
      console.warn('[Billing Auth Debug] Authentication required', {
        path: req.originalUrl,
        hasSession: Boolean(req.session),
        hasSessionUser: Boolean(req.session?.user),
        authenticatedUser: req.user?.id || req.session?.user?.id || null,
      });
    }

    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }

  return next();
}

function requireRole(role) {
  return function checkRole(req, res, next) {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (req.session.user.role !== role) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    return next();
  };
}

const requireAdmin = requireRole("ADMIN");

function requireWriter(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }

  if (req.session.user.role === "ADMIN" || !req.session.user.isWriter) {
    return res.status(403).json({
      success: false,
      error: "Writer access required",
    });
  }

  return next();
}

function requireWriterOrAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
    });
  }

  if (req.session.user.role === "ADMIN" || req.session.user.isWriter) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: "Writer or admin access required",
  });
}

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
  requireWriter,
  requireWriterOrAdmin,
};
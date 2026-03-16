function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
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

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
};
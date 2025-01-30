const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authorization token is required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("Token verification failed:", err);
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    // Comment out or remove these logs
    // console.log("Decoded token:", decoded);
    // console.log("User set in request:", req.user);

    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  });
};

module.exports = { verifyToken };

const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: "Access denied: insufficient permissions" });
      }
      next();
    } catch (error) {
      console.error("Error checking role:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
};

module.exports = { verifyToken, checkRole };

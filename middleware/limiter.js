const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message:
    "Too many request from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

module.exports = limiter;
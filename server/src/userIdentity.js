const crypto = require("node:crypto");

const COOKIE_NAME = "inkspire_user";
const SAFE_USER_ID = /^[a-z0-9-]+$/i;

function parseCookies(header = "") {
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = "";
    }
  }
  return cookies;
}

function newUserId() {
  return `user-${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
}

function isValidUserId(value) {
  return typeof value === "string" && SAFE_USER_ID.test(value);
}

function userIdentityMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || "");
  const existing = cookies[COOKIE_NAME];
  const userId = isValidUserId(existing) ? existing : newUserId();
  req.userId = userId;
  if (existing !== userId) {
    res.cookie(COOKIE_NAME, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production"
    });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  parseCookies,
  userIdentityMiddleware
};

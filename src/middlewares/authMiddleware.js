const jwt = require("jsonwebtoken");
const { assertDatabaseConfigured } = require("../database");
const { User, UserSession } = require("../models");

const asyncMiddleware = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const unauthorized = () =>
  Object.assign(new Error("Unauthorized"), { statusCode: 401 });
const tokenFrom = (req) =>
  (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
const jwtSecrets = () =>
  (process.env.JWT_SECRETS || process.env.JWT_SECRET || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const verify = (token) => {
  const decoded = jwt.decode(token, { complete: true });
  const secrets = jwtSecrets();
  const preferred =
    decoded?.header?.kid === undefined
      ? []
      : [secrets[Number(decoded.header.kid)]];

  for (const secret of [...preferred, ...secrets]) {
    if (!secret) continue;
    try {
      return jwt.verify(token, secret, { algorithms: ["HS256"] });
    } catch (_) {
      // Try the next configured JWT key.
    }
  }
  return null;
};
const authenticate = (firstAccessOnly = false) =>
  asyncMiddleware(async (req, _res, next) => {
    assertDatabaseConfigured();
    const token = tokenFrom(req);
    const payload = verify(token);

    if (
      !token ||
      !payload ||
      !payload.email ||
      Boolean(payload.first_access) !== firstAccessOnly
    ) {
      throw unauthorized();
    }

    if (!firstAccessOnly) {
      const session = await UserSession.findOne({
        where: { session_jwt_token: token, is_active: true },
      });
      if (!session || new Date(session.expires_at).getTime() < Date.now()) {
        throw unauthorized();
      }
    }

    const user = await User.findOne({
      where: { id: payload.id, email: payload.email, is_active: true },
    });
    if (!user) throw unauthorized();

    req.user = user;
    req.token = token;
    req.auth = payload;
    next();
  });

const authMiddleware = authenticate();
const firstAccessAuthMiddleware = authenticate(true);

module.exports = { authMiddleware, firstAccessAuthMiddleware };

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { Op } = require("sequelize");
const { assertDatabaseConfigured } = require("../database");
const { User, UserSession, RolePermission, PasswordResetToken } = require("../models");

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const fail = (message, statusCode = 400, details = null) => Object.assign(new Error(message), { statusCode, details });
const portalType = (value) => String(value || "").trim().toLowerCase() === "proveedor" ? "proveedor" : "interno";
const bool = (value) => value === true || value === 1 || value === "1";
const minutes = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const duration = (value, fallbackMinutes = 60) => {
  const match = String(value || `${fallbackMinutes}m`).match(/^(\d+)(s|m|h|d)?$/i);
  if (!match) return fallbackMinutes * 60000;
  return Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[(match[2] || "m").toLowerCase()]);
};
const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const isLocal = () => /dev|local/.test([process.env.NODE_ENV, process.env.APP_ENV, process.env.ENVIRONMENT].filter(Boolean).join(" ").toLowerCase());
const jwtSecrets = () => (process.env.JWT_SECRETS || process.env.JWT_SECRET || "").split(",").map((value) => value.trim()).filter(Boolean);
const sign = (payload, expiresIn = process.env.JWT_EXPIRES_IN || "1h") => {
  const secrets = jwtSecrets();
  if (!secrets[0]) throw fail("JWT_SECRET o JWT_SECRETS no esta configurado", 503);
  const kid = String(Number(process.env.JWT_ACTIVE_KID || 0) || 0);
  return jwt.sign(payload, secrets[Number(kid)] || secrets[0], { algorithm: "HS256", keyid: kid, expiresIn });
};
const verify = (token) => {
  const decoded = jwt.decode(token, { complete: true });
  const secrets = jwtSecrets();
  const preferred = decoded?.header?.kid === undefined ? [] : [secrets[Number(decoded.header.kid)]];
  for (const secret of [...preferred, ...secrets]) {
    if (!secret) continue;
    try { return jwt.verify(token, secret, { algorithms: ["HS256"] }); } catch (_) { /* try next key */ }
  }
  return null;
};

const permissionsFor = async (roleId) => {
  if (!roleId) return [];
  const rows = await RolePermission.findAll({ where: { role_id: roleId }, raw: true });
  return rows.map(({ permission_id, create_permission, update_permission, delete_permission, synchronize_permission, view_permission }) => ({
    permission_id: Number(permission_id), create_permission: bool(create_permission), update_permission: bool(update_permission),
    delete_permission: bool(delete_permission), synchronize_permission: bool(synchronize_permission), view_permission: bool(view_permission),
  }));
};
const userPayload = async (user) => ({
  id: user.id, name: user.name, email: user.email, role_id: user.role_id,
  status: user.status, temporary_password: bool(user.temporary_password),
  password_reset_attempts: Number(user.password_reset_attempts || 0), microsoft_payload: user.microsoft_payload || null,
  permissions: await permissionsFor(user.role_id),
});
const providerUser = (user) => !bool(user.is_ldap) && bool(user.mfa_enabled);
const firstAccess = (user, type) => portalType(type) === "proveedor" && providerUser(user) && (bool(user.temporary_password) || user.status === "pending");
const createSession = async (user, type) => {
  const token = sign({ id: user.id, email: user.email, role_id: user.role_id, portal_type: portalType(type) });
  const expiresAt = new Date(Date.now() + duration(process.env.JWT_EXPIRES_IN, 60));
  await UserSession.create({ user_id: user.id, session_jwt_token: token, is_active: true, expires_at: expiresAt, mfa_verified_at: new Date() });
  return { token, expiresAt };
};
const createFirstAccessToken = (user, type) => {
  const expiresIn = process.env.FIRST_ACCESS_TOKEN_EXPIRES_IN || "30m";
  return { token: sign({ id: user.id, email: user.email, role_id: user.role_id, first_access: true, portal_type: portalType(type) }, expiresIn), expiresAt: new Date(Date.now() + duration(expiresIn, 30)) };
};
const sendMail = async ({ to, subject, text, html }) => {
  if (String(process.env.MFA_EMAIL_ENABLED || "false").toLowerCase() !== "true") return false;
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) throw fail("El correo esta habilitado pero SMTP no esta configurado", 503);
  const transport = nodemailer.createTransport({ host: SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE) === "true", auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transport.sendMail({ from: SMTP_FROM, to, subject, text, html });
  return true;
};
const issueMfa = async (user) => {
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + minutes(process.env.MFA_CODE_EXPIRES_IN_MINUTES, 10) * 60000);
  const mfaToken = crypto.randomUUID();
  await UserSession.update({ is_active: false }, { where: { user_id: user.id, is_active: true, session_jwt_token: null } });
  await UserSession.create({ user_id: user.id, session_mfa_token: mfaToken, mfa_code_hash: hash(code), mfa_code_expires_at: expiresAt, is_active: true, expires_at: expiresAt });
  let deliveryError = null;
  try { await sendMail({ to: user.email, subject: "Codigo de verificacion", text: `Tu codigo de acceso es: ${code}`, html: `<p>Tu codigo de acceso es: <strong>${code}</strong></p>` }); } catch (error) { deliveryError = error.message; }
  const response = { code: 1, message: "Codigo de verificacion enviado", mfa_required: true, first_access_required: false, mfa_token: mfaToken, expires_at: expiresAt, user: await userPayload(user) };
  if (isLocal() && String(process.env.MFA_EXPOSE_CODE_IN_LOCAL || "false") === "true") response.mfa_code = code;
  if (deliveryError) response.email_delivery_error = deliveryError;
  return response;
};
const tokenFrom = (req) => (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
const authenticate = (firstAccessOnly = false) => asyncRoute(async (req, _res, next) => {
  assertDatabaseConfigured(); const token = tokenFrom(req); const payload = verify(token);
  if (!token || !payload || !payload.email || Boolean(payload.first_access) !== firstAccessOnly) throw fail("Unauthorized", 401);
  if (!firstAccessOnly) {
    const session = await UserSession.findOne({ where: { session_jwt_token: token, is_active: true } });
    if (!session || new Date(session.expires_at).getTime() < Date.now()) throw fail("Unauthorized", 401);
  }
  const user = await User.findOne({ where: { id: payload.id, email: payload.email, is_active: true } });
  if (!user) throw fail("Unauthorized", 401);
  req.user = user; req.token = token; req.auth = payload; next();
});

router.post("/login", asyncRoute(async (req, res) => {
  assertDatabaseConfigured(); const { email, password, portal_type } = req.body || {};
  if (!email || !password) throw fail("Email y contrasena son requeridas");
  const user = await User.findOne({ where: { email: String(email).trim().toLowerCase(), is_active: true } });
  if (!user || !user.password_hash) throw fail("Credenciales invalidas", 401);
  if (!(await bcrypt.compare(String(password), user.password_hash))) {
    const attempts = Number(user.password_reset_attempts || 0) + 1;
    await user.update({ password_reset_attempts: attempts, last_failed_login: new Date() });
    throw fail("Credenciales invalidas", 401, { show_forgot_password: providerUser(user) && attempts >= 3, password_reset_attempts: attempts });
  }
  await user.update({ password_reset_attempts: 0, last_failed_login: null });
  if (firstAccess(user, portal_type)) { const issued = createFirstAccessToken(user, portal_type); return res.json({ code: 1, message: "Primer acceso requerido", token: issued.token, expires_at: issued.expiresAt, mfa_required: false, first_access_required: true, user: await userPayload(user) }); }
  const bypass = isLocal() && String(process.env.MFA_BYPASS_IN_LOCAL || "false") === "true" && String(process.env.MFA_EMAIL_ENABLED || "false") !== "true";
  if (bool(user.mfa_enabled) || String(process.env.MFA_FORCE_FOR_ALL || "false") === "true") { if (!bypass) return res.json(await issueMfa(user)); }
  const issued = await createSession(user, portal_type);
  return res.json({ code: 1, message: "Success", token: issued.token, expires_at: issued.expiresAt, mfa_required: false, first_access_required: false, user: await userPayload(user) });
}));

router.post("/verify-mfa", asyncRoute(async (req, res) => {
  assertDatabaseConfigured(); const { mfa_token, code, portal_type } = req.body || {};
  if (!mfa_token || !code) throw fail("Token MFA y codigo son requeridos");
  const session = await UserSession.findOne({ where: { session_mfa_token: mfa_token, is_active: true } });
  if (!session || !session.mfa_code_expires_at || new Date(session.mfa_code_expires_at).getTime() < Date.now()) throw fail("Solicitud MFA invalida o expirada", 401);
  if (session.mfa_code_hash !== hash(code)) throw fail("Codigo de verificacion invalido", 401);
  const user = await User.findOne({ where: { id: session.user_id, is_active: true } }); if (!user) throw fail("Usuario no encontrado", 404);
  const issued = await createSession(user, portal_type); await session.update({ is_active: false, mfa_verified_at: new Date(), mfa_code_hash: null, session_mfa_token: null });
  return res.json({ code: 1, message: "Success", token: issued.token, expires_at: issued.expiresAt, mfa_required: false, first_access_required: false, user: await userPayload(user) });
}));

router.post("/resend-mfa", asyncRoute(async (req, res) => {
  assertDatabaseConfigured(); const session = await UserSession.findOne({ where: { session_mfa_token: req.body?.mfa_token, is_active: true } });
  if (!session) throw fail("Solicitud MFA invalida o expirada", 401); const user = await User.findOne({ where: { id: session.user_id, is_active: true } }); if (!user) throw fail("Usuario no encontrado", 404);
  const code = String(crypto.randomInt(100000, 1000000)); const expiresAt = new Date(Date.now() + minutes(process.env.MFA_CODE_EXPIRES_IN_MINUTES, 10) * 60000);
  await session.update({ mfa_code_hash: hash(code), mfa_code_expires_at: expiresAt, expires_at: expiresAt });
  try { await sendMail({ to: user.email, subject: "Codigo de verificacion", text: `Tu codigo de acceso es: ${code}`, html: `<p>Tu codigo de acceso es: <strong>${code}</strong></p>` }); } catch (_) { /* challenge remains valid */ }
  return res.json({ code: 1, message: "Codigo reenviado", mfa_required: true, first_access_required: false, mfa_token: session.session_mfa_token, expires_at: expiresAt, user: await userPayload(user) });
}));

router.get("/me", authenticate(), asyncRoute(async (req, res) => res.json({ code: 1, message: "Success", first_access_required: false, user: await userPayload(req.user) })));
router.post("/logout", authenticate(), asyncRoute(async (req, res) => { await UserSession.update({ is_active: false }, { where: { session_jwt_token: req.token } }); res.json({ code: 1, message: "Logged out" }); }));
router.get("/first-access/me", authenticate(true), asyncRoute(async (req, res) => { if (!firstAccess(req.user, req.auth.portal_type)) throw fail("Primer acceso no disponible", 403); res.json({ code: 1, message: "Success", first_access_required: true, user: await userPayload(req.user) }); }));
router.post("/first-access/complete", authenticate(true), asyncRoute(async (req, res) => {
  const { temporary_password, current_password, new_password, password_confirmation, confirm_password } = req.body || {}; const current = temporary_password || current_password; const confirmation = password_confirmation || confirm_password;
  if (!current || !new_password || !confirmation) throw fail("Debes completar todos los campos"); if (String(new_password).length < 8) throw fail("La nueva contrasena debe tener al menos 8 caracteres"); if (new_password !== confirmation) throw fail("La confirmacion de contrasena no coincide");
  if (!firstAccess(req.user, req.auth.portal_type) || !(await bcrypt.compare(String(current), req.user.password_hash))) throw fail("La contrasena temporal no es valida", 401);
  await UserSession.update({ is_active: false }, { where: { user_id: req.user.id, session_jwt_token: { [Op.ne]: null } } }); await req.user.update({ password_hash: await bcrypt.hash(String(new_password), 10), temporary_password: false, status: "active", email_verified_at: new Date(), activation_token: null, password_reset_attempts: 0, last_failed_login: null });
  const issued = await createSession(req.user, req.auth.portal_type); res.json({ code: 1, message: "Contrasena actualizada correctamente", token: issued.token, expires_at: issued.expiresAt, mfa_required: false, first_access_required: false, user: await userPayload(req.user) });
}));

router.post("/forgot-password", asyncRoute(async (req, res) => {
  assertDatabaseConfigured(); const response = { code: 1, message: "Si el correo existe recibiras un enlace para recuperar tu contrasena." }; const email = String(req.body?.email || "").trim().toLowerCase(); if (!email) return res.json(response);
  const user = await User.findOne({ where: { email, is_active: true } }); if (!user || !providerUser(user)) return res.json(response);
  const rawToken = crypto.randomBytes(32).toString("hex"); const expiresAt = new Date(Date.now() + minutes(process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN_MINUTES, 5) * 60000);
  await PasswordResetToken.upsert({ email, token: hash(rawToken), expires_at: expiresAt, used_at: null }); const base = String(process.env.PROVIDER_PORTAL_URL || process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
  await sendMail({ to: user.email, subject: "Recuperar contrasena", text: `${base}/reset-password/${rawToken}`, html: `<p><a href="${base}/reset-password/${rawToken}">Recuperar contrasena</a></p>` }); return res.json(response);
}));

router.post("/reset-password/:token", asyncRoute(async (req, res) => {
  assertDatabaseConfigured(); const { new_password, password_confirmation, confirm_password } = req.body || {}; const confirmation = password_confirmation || confirm_password; if (!new_password || !confirmation || new_password !== confirmation || String(new_password).length < 8) throw fail("Datos de contrasena invalidos");
  const reset = await PasswordResetToken.findOne({ where: { token: hash(req.params.token), used_at: null } }); if (!reset || new Date(reset.expires_at).getTime() < Date.now()) throw fail("El enlace de recuperacion es invalido o ha expirado", 400);
  const user = await User.findOne({ where: { email: reset.email, is_active: true } }); if (!user || !providerUser(user)) throw fail("El enlace de recuperacion es invalido", 400);
  await user.update({ password_hash: await bcrypt.hash(String(new_password), 10), temporary_password: false, status: "active", password_reset_attempts: 0, last_failed_login: null }); await reset.update({ used_at: new Date() }); res.json({ code: 1, message: "Contrasena actualizada correctamente." });
}));

router.post("/sso/microsoft", asyncRoute(async (req, res) => {
  assertDatabaseConfigured(); const { code } = req.body || {}; if (!code) throw fail("Code es requerido"); const { ENTRA_CLIENT_ID: clientId, ENTRA_TENANT_ID: tenantId, ENTRA_CLIENT_SECRET: clientSecret, ENTRA_REDIRECT_URI: redirectUri } = process.env; if (!clientId || !tenantId || !clientSecret || !redirectUri) throw fail("Faltan variables de entorno para Microsoft SSO", 503);
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code", scope: "openid profile email User.Read" }); const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }); const data = await tokenResponse.json(); if (!tokenResponse.ok) throw fail(data.error_description || "No se pudo completar la autenticacion con Microsoft", 401);
  const claims = jwt.decode(data.id_token) || {}; const email = String(claims.email || claims.preferred_username || "").trim().toLowerCase(); const user = await User.findOne({ where: { email, is_active: true } }); if (!user) throw fail("Tu correo de Microsoft no esta registrado en el portal", 403);
  await user.update({ is_ldap: true, microsoft_payload: JSON.stringify({ claims, updated_at: new Date().toISOString() }) }); const issued = await createSession(user, "interno"); res.json({ code: 1, message: "Success", token: issued.token, expires_at: issued.expiresAt, user: await userPayload(user) });
}));

module.exports = router;

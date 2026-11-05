const nodemailer = require("nodemailer");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

let smtpTransport = null;
let sesTransport = null;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const emailLayout = ({ title, preview, content }) => `
  <!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;color:#1e293b;font-family:Arial,Helvetica,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preview)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.10);">
              <tr>
                <td style="padding:28px 36px;background:#0f172a;color:#ffffff;">
                  <div style="font-size:13px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#93c5fd;">IB Group</div>
                  <div style="margin-top:6px;font-size:23px;font-weight:700;line-height:1.25;">${escapeHtml(title)}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:34px 36px;font-size:16px;line-height:1.6;color:#334155;">
                  ${content}
                </td>
              </tr>
              <tr>
                <td style="padding:20px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
                  Este es un mensaje automático de IB Group. Por seguridad, no compartas códigos ni enlaces de acceso con nadie.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`;

const buildMfaEmail = ({ name, code, expiresInMinutes }) => {
  const safeName = escapeHtml(name || "usuario");
  const safeCode = escapeHtml(code);
  const subject = "Código de verificación de IB Group";
  return {
    subject,
    text: `Hola ${name || "usuario"},\n\nTu código de verificación es: ${code}\n\nEste código vence en ${expiresInMinutes} minutos. Si no solicitaste este acceso, ignora este mensaje.`,
    html: emailLayout({
      title: "Verifica tu acceso",
      preview: `Tu código de verificación es ${code}`,
      content: `
        <p style="margin:0 0 16px;">Hola ${safeName},</p>
        <p style="margin:0 0 24px;">Recibimos un intento de inicio de sesión. Ingresa el siguiente código para continuar:</p>
        <div style="margin:0 0 24px;padding:18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:9px;color:#1d4ed8;">${safeCode}</div>
        <p style="margin:0;color:#475569;">Este código vence en <strong>${escapeHtml(expiresInMinutes)} minutos</strong>.</p>
        <p style="margin:16px 0 0;color:#475569;">Si no fuiste tú, puedes ignorar este correo.</p>
      `,
    }),
  };
};

const buildPasswordResetEmail = ({ resetLink, expiresInMinutes }) => {
  const safeLink = escapeHtml(resetLink);
  const subject = "Recupera tu contraseña de IB Group";
  return {
    subject,
    text: `Recibimos una solicitud para recuperar tu contraseña. Abre este enlace: ${resetLink}\n\nEl enlace vence en ${expiresInMinutes} minutos. Si no solicitaste el cambio, ignora este mensaje.`,
    html: emailLayout({
      title: "Recupera tu contraseña",
      preview: "Usa el enlace para crear una nueva contraseña",
      content: `
        <p style="margin:0 0 16px;">Hola,</p>
        <p style="margin:0 0 24px;">Recibimos una solicitud para recuperar tu contraseña. Haz clic en el botón para crear una nueva.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
          <tr>
            <td style="border-radius:8px;background:#2563eb;">
              <a href="${safeLink}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Restablecer contraseña</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 8px;color:#475569;">Este enlace vence en <strong>${escapeHtml(expiresInMinutes)} minutos</strong>.</p>
        <p style="margin:0;color:#475569;">Si el botón no funciona, copia este enlace en tu navegador:</p>
        <p style="margin:8px 0 0;word-break:break-all;"><a href="${safeLink}" style="color:#2563eb;">${safeLink}</a></p>
      `,
    }),
  };
};

const resolveRecipient = (recipient) => {
  if (String(process.env.SEND_EMAIL_TEST || "").trim() !== "1") {
    return recipient;
  }

  const testRecipient = String(process.env.SEND_EMAIL_TEST_TO || "").trim();
  if (!testRecipient) {
    throw new Error(
      "SEND_EMAIL_TEST esta habilitado pero SEND_EMAIL_TEST_TO no esta configurado",
    );
  }
  return testRecipient;
};

const getSmtpTransport = () => {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;

  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return smtpTransport;
};

const getSesTransport = () => {
  if (!sesTransport) {
    const sesClient = new SESv2Client({
      region: process.env.AWS_REGION || "us-east-1",
    });
    sesTransport = nodemailer.createTransport({
      SES: { sesClient, SendEmailCommand },
    });
  }
  return sesTransport;
};

const sendEmail = async ({ to, subject, text, html }) => {
  const from = String(process.env.SMTP_FROM || "").trim();
  if (!from)
    throw new Error("SMTP_FROM no configurado para el envio de correo");

  const transport = getSmtpTransport() || getSesTransport();
  return transport.sendMail({
    from,
    to: resolveRecipient(to),
    subject,
    text,
    html,
  });
};

module.exports = { sendEmail, buildMfaEmail, buildPasswordResetEmail };

const nodemailer = require("nodemailer");
const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

let smtpTransport = null;
let sesTransport = null;

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

module.exports = { sendEmail };

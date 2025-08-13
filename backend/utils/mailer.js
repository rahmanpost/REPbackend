// backend/utils/mailer.js
// ESM module
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

const {
  MAIL_MODE = 'gmail',           // gmail | smtp | mailtrap | mock
  EMAIL_USER,
  EMAIL_PASS,
  EMAIL_HOST,
  EMAIL_PORT,
  EMAIL_FROM,
  NODE_ENV,
} = process.env;

// ➜ If using gmail/smtp but creds are missing, fall back to MOCK (no send, writes .eml)
const CREDS_MISSING =
  (MAIL_MODE === 'gmail' || MAIL_MODE === 'smtp') && (!EMAIL_USER || !EMAIL_PASS);

let transporter;

/** Create and cache a Nodemailer transporter with multiple modes */
function getTransporter() {
  if (transporter) return transporter;

  // Explicit mock mode OR implicit mock because creds are missing
  if (MAIL_MODE === 'mock' || CREDS_MISSING) {
    transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    console.warn(
      CREDS_MISSING
        ? '[mailer] Missing SMTP creds -> using MOCK transport (emails not sent)'
        : '[mailer] Using MOCK transport (emails not sent)'
    );
    return transporter;
  }

  if (MAIL_MODE === 'mailtrap') {
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST || 'sandbox.smtp.mailtrap.io',
      port: Number(EMAIL_PORT || 2525),
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });
  } else if (MAIL_MODE === 'smtp') {
    const port = Number(EMAIL_PORT || 587);
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST || 'localhost',
      port,
      secure: port === 465,
      auth: (EMAIL_USER || EMAIL_PASS) ? { user: EMAIL_USER, pass: EMAIL_PASS } : undefined,
    });
  } else {
    // gmail (default)
    const port = Number(EMAIL_PORT || 465);
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });
  }

  // Only verify real SMTP transports in non-production
  if (NODE_ENV !== 'production') {
    transporter.verify().then(
      () => console.log('[mailer] SMTP connection verified'),
      (err) => console.error('[mailer] SMTP verification failed:', err?.message || err)
    );
  }

  return transporter;
}

/** Minimal, safe HTML wrapper with matching text fallback */
function buildEmailContent({ title, bodyHtml, bodyText }) {
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="color-scheme" content="light only">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title || 'Message')}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.05);overflow:hidden">
            <tr>
              <td style="padding:24px 24px 0 24px;">
                <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;">${escapeHtml(
                  title || 'Message'
                )}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px 24px;line-height:1.6;font-size:15px;">
                ${bodyHtml || '<p>No content</p>'}
                <p style="margin-top:24px;color:#6b7280;font-size:12px">If you weren’t expecting this email, you can safely ignore it.</p>
              </td>
            </tr>
          </table>
          <div style="padding:12px;color:#9ca3af;font-size:12px">© ${new Date().getFullYear()} Rahman Express Post</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text =
    bodyText ||
    (typeof bodyHtml === 'string'
      ? bodyHtml.replace(/<[^>]+>/g, '').replace(/\s+\n/g, '\n').trim()
      : '');

  return { html, text };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Core sender.
 * @param {Object} opts
 * @param {string|string[]} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.html]
 * @param {string} [opts.text]
 * @param {Array}  [opts.attachments]
 * @param {Object} [opts.template] - { title, bodyHtml, bodyText }
 * @param {string} [opts.from]
 * @param {Object} [opts.headers]
 */
export async function sendEmail(opts = {}) {
  const {
    to,
    subject,
    html,
    text,
    attachments,
    template,
    from = EMAIL_FROM || EMAIL_USER,
    headers,
  } = opts;

  if (!to) throw new Error('sendEmail: "to" is required');
  if (!subject) throw new Error('sendEmail: "subject" is required');

  let payload = { html, text };
  if (!html) {
    const built = buildEmailContent({
      title: template?.title || subject,
      bodyHtml: template?.bodyHtml,
      bodyText: template?.bodyText,
    });
    payload = built;
  }

  const info = await getTransporter().sendMail({
    from,
    to,
    subject,
    html: payload.html,
    text: payload.text,
    attachments: attachments || [],
    headers: headers || {},
  });

  // If mock mode, save .eml so you can inspect it
  if ((MAIL_MODE === 'mock' || CREDS_MISSING) && info?.message) {
    const out = path.join(process.cwd(), 'backend', 'tmp');
    fs.mkdirSync(out, { recursive: true });
    const p = path.join(out, `mail-${Date.now()}.eml`);
    fs.writeFileSync(p, info.message);
    console.log('[mailer] mock email saved:', p);
  }

  return info;
}

/** Convenience helpers */

export async function sendVerificationEmail({ to, verifyUrl }) {
  if (!to || !verifyUrl) throw new Error('sendVerificationEmail requires { to, verifyUrl }');

  return sendEmail({
    to,
    subject: 'Verify your email',
    template: {
      title: 'Verify your email',
      bodyHtml: `
        <p>Thanks for signing up with Rahman Express Post.</p>
        <p>Please confirm your email address by clicking the button below:</p>
        <p style="margin:16px 0">
          <a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;text-decoration:none;background:#111;color:#fff;font-weight:600">
            Verify Email
          </a>
        </p>
        <p>Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(
          verifyUrl
        )}</span></p>
      `,
      bodyText: `Please verify your email: ${verifyUrl}`,
    },
  });
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
  if (!to || !resetUrl) throw new Error('sendPasswordResetEmail requires { to, resetUrl }');

  return sendEmail({
    to,
    subject: 'Reset your password',
    template: {
      title: 'Reset your password',
      bodyHtml: `
        <p>We received a request to reset your password.</p>
        <p>If you made this request, click the button below to set a new password. This link may expire soon.</p>
        <p style="margin:16px 0">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;text-decoration:none;background:#111;color:#fff;font-weight:600">
            Reset Password
          </a>
        </p>
        <p>If you didn't request this, you can ignore this email. Your password will stay the same.</p>
        <p>Link (for reference):<br><span style="word-break:break-all">${escapeHtml(
          resetUrl
        )}</span></p>
      `,
      bodyText: `Reset your password: ${resetUrl}`,
    },
  });
}

export async function sendInvoiceEmail({ to, subject = 'Your invoice', message, attachments = [] }) {
  if (!to) throw new Error('sendInvoiceEmail requires { to }');
  return sendEmail({
    to,
    subject,
    template: {
      title: subject,
      bodyHtml: `<p>${escapeHtml(message || 'Please find your invoice attached.')}</p>`,
      bodyText: message || 'Please find your invoice attached.',
    },
    attachments,
  });
}

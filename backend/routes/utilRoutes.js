// backend/routes/utilRoutes.js
import express from 'express';
import { protect, isAdmin } from '../middleware/authMiddleware.js';
import { sendEmail } from '../utils/mailer.js';

const router = express.Router();

/**
 * POST /api/utils/test-mail
 * Body: { to: string, subject?: string, html?: string, text?: string }
 * Requires: Bearer token for an ADMIN user
 */
router.post('/test-mail', protect, isAdmin, async (req, res) => {
  try {
    const { to, subject = 'REP mailer test', html, text } = req.body || {};
    if (!to) {
      return res.status(400).json({ success: false, message: '"to" is required' });
    }

    const payload = {
      to,
      subject,
      ...(html ? { html } : { template: { title: subject, bodyHtml: '<p>Test email from REP.</p>' } }),
      ...(text ? { text } : {}),
    };

    const info = await sendEmail(payload);

    return res.json({
      success: true,
      message: 'Email attempted',
      details: {
        messageId: info?.messageId || null,
        note:
          'If MAIL_MODE is mock or creds are missing, an .eml file is saved under backend/tmp/. ' +
          'If Gmail creds are valid, check your inbox (and Sent).',
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Failed to send email',
    });
  }
});

export default router;

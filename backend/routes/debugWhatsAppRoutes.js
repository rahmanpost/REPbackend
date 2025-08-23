import express from 'express';

const router = express.Router();
const GRAPH_BASE = 'https://graph.facebook.com/v20.0';

// Small helper to call Graph API
async function callGraph(payload) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID in env'
      }
    };
  }

  const url = `${GRAPH_BASE}/${phoneId}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const raw = await resp.text();
  let data; try { data = JSON.parse(raw); } catch { data = { raw }; }

  return {
    status: resp.status,
    body: resp.ok
      ? { success: true, result: data }
      : { success: false, error: 'Graph API error', status: resp.status, details: data }
  };
}

/** GET /api/debug/whatsapp/ping
 * Quick env check (does not leak token).
 */
router.get('/whatsapp/ping', (req, res) => {
  res.json({
    success: true,
    hasToken: Boolean(process.env.WHATSAPP_TOKEN),
    hasPhoneId: Boolean(process.env.WHATSAPP_PHONE_ID),
    toFallback: process.env.WHATSAPP_TO_TEST ? 'set' : 'not-set'
  });
});

/** POST /api/debug/whatsapp/text
 * Body: { to?: "+93...", text?: "Hello" }
 */
router.post('/whatsapp/text', async (req, res) => {
  try {
    const { to, text } = req.body || {};
    const recipient = to || process.env.WHATSAPP_TO_TEST;
    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: 'Provide "to" in body or set WHATSAPP_TO_TEST in .env'
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: { body: text || 'Hello from Rahman Express Post 👋' }
    };

    const { status, body } = await callGraph(payload);
    return res.status(status).json(body);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/debug/whatsapp/document
 * Body: { to?: "+93...", link: "https://...", filename?: "Invoice.pdf" }
 */
router.post('/whatsapp/document', async (req, res) => {
  try {
    const { to, link, filename } = req.body || {};
    const recipient = to || process.env.WHATSAPP_TO_TEST;

    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: 'Provide "to" in body or set WHATSAPP_TO_TEST in .env'
      });
    }
    if (!link || !/^https?:\/\//i.test(link)) {
      return res.status(400).json({
        success: false,
        message: 'Provide a public HTTPS "link" to a PDF or document'
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'document',
      document: {
        link,
        filename: filename || 'document.pdf'
      }
    };

    const { status, body } = await callGraph(payload);
    return res.status(status).json(body);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});


// POST /api/debug/whatsapp/template-invoice
// Sends a template message with a DOCUMENT header (PDF)
router.post('/whatsapp/template-invoice', async (req, res) => {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_INVOICE || 'rep_invoice_pdf';
    const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

    if (!token || !phoneId) {
      return res.status(400).json({ success:false, message:'Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID in env' });
    }

    const {
      to,                       // "+93..."
      customerName = 'Customer',
      invoiceNumber = 'INV-0001',
      trackingId = 'TRACK12345',
      amount = '0 AFN',
      pdfLink,                  // REQUIRED: public HTTPS link
      filename                  // optional
    } = req.body || {};

    const recipient = to || process.env.WHATSAPP_TO_TEST;
    if (!recipient) return res.status(400).json({ success:false, message:'Provide "to" or set WHATSAPP_TO_TEST' });
    if (!pdfLink || !/^https?:\/\//i.test(pdfLink)) {
      return res.status(400).json({ success:false, message:'Provide "pdfLink" as a public HTTPS URL' });
    }
    const fname = filename || `Invoice-${invoiceNumber}.pdf`;

    const payload = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { policy: 'deterministic', code: lang },
        components: [
          {
            type: 'header',
            parameters: [{ type: 'document', document: { link: pdfLink, filename: fname } }]
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: String(customerName) },
              { type: 'text', text: String(invoiceNumber) },
              { type: 'text', text: String(trackingId) },
              { type: 'text', text: String(amount) }
            ]
          }
        ]
      }
    };

    const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const raw = await r.text(); let data; try { data = JSON.parse(raw); } catch { data = { raw }; }

    return res.status(r.ok ? 200 : r.status).json(
      r.ok ? { success:true, result:data } : { success:false, error:'Graph API error', status:r.status, details:data }
    );
  } catch (e) {
    return res.status(500).json({ success:false, message:e.message });
  }
});

// GET /api/debug/whatsapp/templates
router.get('/whatsapp/templates', async (req, res) => {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    if (!token || !phoneId) {
      return res.status(400).json({ success:false, message:'Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID' });
    }
    // Find WABA from phone ID
    const inspectUrl = `https://graph.facebook.com/v22.0/${phoneId}?fields=whatsapp_business_account`;
    const i = await fetch(inspectUrl, { headers: { Authorization: `Bearer ${token}` } });
    const inspect = await i.json();
    const wabaId = inspect?.whatsapp_business_account?.id;
    if (!wabaId) {
      return res.status(200).json({ success:false, message:'Could not resolve WABA from phone ID', inspect });
    }
    // List templates
    const listUrl = `https://graph.facebook.com/v22.0/${wabaId}/message_templates?limit=200&fields=name,status,category,languages`;
    const l = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    const templates = await l.json();
    return res.status(l.ok ? 200 : l.status).json({ success:l.ok, wabaId, templates });
  } catch (e) {
    return res.status(500).json({ success:false, message:e.message });
  }
});

export default router;

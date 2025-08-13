// backend/scripts/test-mail.js
import 'dotenv/config';                 // <-- loads backend/.env BEFORE mailer
const { sendEmail } = await import('../utils/mailer.js');  // dynamic import AFTER env

const to = process.argv[2] || process.env.TEST_TO || process.env.EMAIL_USER;
if (!to) {
  console.error('Provide a recipient: node backend/scripts/test-mail.js you@example.com');
  process.exit(1);
}

const info = await sendEmail({
  to,
  subject: 'Mailer smoke test',
  template: { title: 'Mailer works', bodyHtml: '<p>Hello from REP mailer.</p>' },
});

console.log('MAIL_MODE:', process.env.MAIL_MODE);
console.log('To:', to);
console.log('Result:', info?.messageId || info);

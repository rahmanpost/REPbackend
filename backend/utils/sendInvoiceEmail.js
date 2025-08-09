import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



// utils/sendInvoiceEmail.js

export const sendInvoiceEmail = async (userEmail, pdfBuffer) => {
  console.log(`📧 [EMAIL DISABLED] Skipping email to: ${userEmail}`);
  return; // no-op
};


// export const sendInvoiceEmail = async ({ to, subject, text, attachmentPath }) => {
//   try {
//     const transporter = nodemailer.createTransport({
//       service: 'Gmail', // or your mail service
//       auth: {
//         user: process.env.EMAIL_USERNAME,
//         pass: process.env.EMAIL_PASSWORD,
//       },
//     });

//     const mailOptions = {
//       from: process.env.EMAIL_USERNAME,
//       to,
//       subject,
//       text,
//       attachments: [
//         {
//           filename: path.basename(attachmentPath),
//           path: attachmentPath,
//         },
//       ],
//     };
    
//     const info = await transporter.sendMail(mailOptions);
//     console.log('📧 Email sent:', info.response);
//   } catch (error) {
//     console.error('❌ Email sending failed:', error.message);
//     throw error;
//   }
// };

// controllers/invoiceController.js
import Shipment from '../models/shipment.js';
import { generateInvoicePDF } from '../utils/invoice/generateInvoicePDF.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendInvoiceEmail } from '../utils/sendInvoiceEmail.js'; 


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await Shipment.findById(id)
      .populate('sender', 'fullName phoneNumber email address')
      .populate('receiver', 'fullName phoneNumber email nic address')

      .lean();

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    const invoiceDir = path.join(__dirname, '../invoices');
    const invoicePath = path.join(invoiceDir, `invoice-${shipment.trackingId || shipment._id}.pdf`);
    const logoPath = path.join(__dirname, '../assets/logo.png');

    const savedPath = await generateInvoicePDF(shipment, invoicePath, logoPath);

    const userEmail = shipment.sender?.email;
    if (userEmail) {
      await sendInvoiceEmail({
        to: userEmail,
        subject: `Invoice for your shipment (${shipment.trackingId})`,
        text: `Dear ${shipment.sender.fullName},\n\nAttached is your shipment invoice.\n\nRegards,\nRahman Express Post`,
        attachmentPath: savedPath,
      });
    }

    res.status(200).json({
      message: 'Invoice generated successfully',
      filePath: savedPath.replace(/\\/g, '/'),
      trackingId: shipment.trackingId,
    });

  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ message: 'Failed to generate invoice', error: error.message });
  }
};



export const downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const invoicePath = path.join(process.cwd(), 'invoices', `invoice-${id}.pdf`);
    
    res.download(invoicePath);
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500).json({ message: 'Failed to download invoice' });
  }
};




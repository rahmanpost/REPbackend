// backend/controllers/shipmentController.js

import Shipment from '../models/shipment.js';
import generateTrackingId from '../utils/generateTrackingId.js';
import { generateInvoicePDF } from '../utils/invoice/generateInvoicePDF.js';
import { sendInvoiceEmail } from '../utils/sendInvoiceEmail.js';
import { generateInvoiceNumber } from '../utils/generateInvoiceNumber.js';


import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



// -----------------------------
// Shipment Tracking & Info
// -----------------------------

// Track shipment by trackingId (public)
export const trackShipment = async (req, res) => {
  const trackingId = req.params.trackingId;
  try {
    const shipment = await Shipment.findOne({ trackingId });
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    res.json({ status: shipment.status, shipment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Get shipments of logged-in user
export const getMyShipments = async (req, res) => {
  try {
    const shipments = await Shipment.find({ sender: req.user._id }).sort({
      createdAt: -1,
    });
    res.status(200).json(shipments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get single shipment details for owner
export const getShipmentByIdForUser = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      sender: req.user._id,
    });
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found or access denied' });
    }
    res.json(shipment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// -----------------------------
// Shipment Creation & Uploads
// -----------------------------

// Create new shipment (user)
export const createShipment = async (req, res) => {
  console.log('🧪 Authenticated user ID:', req.user?._id);

  try {
    const {
      receiver,
      pickupAddress,
      pickupTimeSlot,
      price,
      packageDetails,
      payment,
    } = req.body;

    if (
      !receiver?.fullName || !receiver?.phoneNumber ||
      !pickupAddress?.addressLine || !pickupAddress?.city ||
      !pickupTimeSlot || !price || !packageDetails?.weight || !packageDetails?.type
    ) {
      return res.status(400).json({ message: 'Missing required shipment fields.' });
    }

    const trackingId = generateTrackingId();
    const invoiceNumber = await generateInvoiceNumber();

    const newShipment = new Shipment({
      sender: req.user._id,
      receiver,
      pickupAddress,
      pickupTimeSlot,
      price,
      trackingId,
      packageDetails,
      payment,
      invoiceNumber,
    });

    await newShipment.save();

    // ✅ Create plain JS object and attach sender full info
    const shipmentData = newShipment.toObject();
    shipmentData.sender = {
      name: req.user.name,
      email: req.user.email,
      phoneNumber: req.user.phoneNumber,
    };

    const invoiceDir = path.join(__dirname, '../invoices');
    const invoicePath = path.join(invoiceDir, `invoice-${trackingId}.pdf`);
    const logoPath = path.join(__dirname, '../assets/logo.png');

    await generateInvoicePDF(shipmentData, invoicePath, logoPath); // 🛠 now includes full sender

    // ✅ Email Invoice (optional - email sending disabled or conditional)
    if (req.user.email) {
      await sendInvoiceEmail({
        to: req.user.email,
        subject: `Invoice for shipment ${trackingId}`,
        text: `Dear ${req.user.name},\n\nAttached is your shipment invoice.`,
        attachmentPath: invoicePath,
      });
    }

    res.status(201).json({
      message: 'Shipment created successfully',
      shipment: newShipment,
    });
  } catch (error) {
    console.error('Shipment creation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// Upload shipment files (photos, receipt)
export const uploadShipmentFiles = async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    if (req.files.beforePhoto) shipment.beforePhoto = req.files.beforePhoto[0].path;
    if (req.files.afterPhoto) shipment.afterPhoto = req.files.afterPhoto[0].path;
    if (req.files.receipt) shipment.receipt = req.files.receipt[0].path;

    await shipment.save();

    res.status(200).json({ message: 'Files uploaded successfully', shipment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// -----------------------------
// Shipment Status Updates & Cancellation
// -----------------------------

// Placeholder notification function
export const sendShipmentStatusNotification = (userPhoneOrEmail, status) => {
  console.log(`📬 Notify ${userPhoneOrEmail} - Shipment status: ${status}`);
};

// Update shipment status (agent only)
export const updateShipmentStatus = async (req, res) => {
  try {
    const shipmentId = req.params.id;
    const { status, locationNote } = req.body;

    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    if (!shipment.assignedAgent || shipment.assignedAgent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this shipment' });
    }

    shipment.status = status;
    sendShipmentStatusNotification(req.user.email, shipment.status); // fixed user ref

    if (locationNote) {
      shipment.tracking.push({
        status,
        locationNote,
        updatedAt: new Date(),
      });
    }

    await shipment.save();

    res.status(200).json({
      message: 'Shipment status updated successfully',
      shipment,
    });
  } catch (error) {
    console.error('Error updating shipment status:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel shipment (only if not picked up)
export const cancelShipment = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      sender: req.user._id,
    });

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    if (shipment.status !== 'pickup-scheduled') {
      return res.status(400).json({ message: 'Cannot cancel shipment once picked up or in transit' });
    }

    shipment.status = 'cancelled';
    await shipment.save();

    res.json({ message: 'Shipment cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};




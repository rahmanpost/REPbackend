// backend/controllers/shipmentController.js

import Shipment from '../models/shipment.js';
import Pricing from '../models/pricing.js';
import { generateInvoiceNumber } from '../utils/generateInvoiceNumber.js';
import generateTrackingId from '../utils/generateTrackingId.js';


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

export const createShipment = async (req, res) => {
  try {
    const {
      pickupAddress,
      pickupTimeSlot,
      receiver,
      packageDetails,
      payment,
    } = req.body;

    // Generate tracking ID and invoice number
    const trackingId = generateTrackingId();
    const invoiceNumber = await generateInvoiceNumber();

    // Lookup pricing based on provinces/cities
    const pricing = await Pricing.findOne({
      fromProvince: pickupAddress.city,
      toProvince: receiver.city,
    });

    if (!pricing) {
      return res.status(400).json({ message: 'No pricing found for this route' });
    }

    // Create shipment document
    const shipment = new Shipment({
      sender: req.user._id, // from auth middleware
      pickupAddress,
      pickupTimeSlot,
      receiver,
      packageDetails,
      payment,
      trackingId,
      invoiceNumber,
      price: pricing.price,  // Add price from pricing model
    });

    const saved = await shipment.save();

    res.status(201).json({
      message: 'Shipment created successfully',
      trackingId: saved.trackingId,
      shipment: saved,
    });
  } catch (error) {
    console.error('Shipment creation error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate trackingId or invoiceNumber. Please try again.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};


// @desc    Get shipments for current user
// @route   GET /api/shipments
// @access  Authenticated users
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




// @desc    Agent updates shipment status (e.g., "In Transit", "Delivered")
// @route   PUT /api/shipments/:id/update-status
// @access  Private (Agent only)
export const updateShipmentStatus = async (req, res) => {
  try {
    const shipmentId = req.params.id;
    const { status, locationNote } = req.body; // locationNote is optional

    // Find the shipment by ID
    const shipment = await Shipment.findById(shipmentId);

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Only the assigned agent can update this shipment
    if (!shipment.assignedAgent || shipment.assignedAgent.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this shipment' });
    }

    // Update the shipment status and optionally add a location note
    shipment.status = status;

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


// @desc    Cancel a shipment (only if not picked up)
// @route   PUT /api/shipments/:id/cancel
// @access  Customer (authenticated)
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
      return res
        .status(400)
        .json({ message: 'Cannot cancel shipment once picked up or in transit' });
    }

    shipment.status = 'cancelled';
    await shipment.save();

    res.json({ message: 'Shipment cancelled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Get a single shipment's details for the logged-in user
// @route   GET /api/shipments/:id
// @access  Authenticated user (sender only)
export const getShipmentByIdForUser = async (req, res) => {
  try {
    const shipment = await Shipment.findOne({
      _id: req.params.id,
      sender: req.user._id, // ensure only the owner can view
    });

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found or access denied' });
    }

    res.json(shipment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


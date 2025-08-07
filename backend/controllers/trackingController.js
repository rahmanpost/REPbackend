
import TrackingLog from '../models/TrackingLog.js';
import Shipment from '../models/shipment.js';
import { getDistance } from 'geolib';
import User from '../models/User.js'; // for email notification
//import sendEmail from '../utils/sendEmail.js'; // optional




// @desc    Get current shipment location
// @route   GET /api/track/:shipmentId/current-location
// @access  Private (Admin or shipment owner)
export const getCurrentShipmentLocation = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await Shipment.findById(shipmentId);

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Check authorization: only admin or shipment owner can access
    if (
      req.user.role !== 'admin' &&
      shipment.sender.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to view this location' });
    }

    if (!shipment.currentLocation || !shipment.currentLocation.latitude || !shipment.currentLocation.longitude) {
      return res.status(404).json({ message: 'Current location not available' });
    }

    res.status(200).json({
      shipmentId,
      currentLocation: shipment.currentLocation,
    });
  } catch (error) {
    console.error('Error in getCurrentShipmentLocation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// @desc    Agent updates current shipment location
// @route   POST /api/track/:shipmentId/update-location
// @access  Private (Agent only)
export const updateShipmentLocation = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Latitude and longitude are required' });
    }

    // Find the shipment
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Update the currentLocation field
    shipment.currentLocation = {
      latitude,
      longitude,
      updatedAt: new Date(),
    };
    await shipment.save();

    // Save to tracking log history
    const log = new TrackingLog({
      shipment: shipmentId,
      latitude,
      longitude,
      timestamp: new Date(),
    });
    await log.save();

    res.status(200).json({ message: 'Location updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};




export const getLiveTracking = async (req, res) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await Shipment.findById(shipmentId);

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Only admin or shipment owner can access
    if (
      req.user.role !== 'admin' &&
      shipment.user.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to view this tracking info' });
    }

    const logs = await TrackingLog.find({ shipment: shipmentId }).sort({ timestamp: -1 });

    res.status(200).json({ shipmentId, logs });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


export const updateLiveLocation = async (req, res) => {
  try {
    const { shipmentId, latitude, longitude } = req.body;

    const shipment = await Shipment.findById(shipmentId).populate('user');

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    // Save tracking log
    const log = new TrackingLog({
      shipment: shipmentId,
      agent: req.user._id,
      latitude,
      longitude,
    });

    await log.save();

    // 📍 Check proximity (if shipment has destination coords)
    if (shipment.latitude && shipment.longitude) {
      const distanceInMeters = getDistance(
        { latitude, longitude },
        { latitude: shipment.latitude, longitude: shipment.longitude }
      );

      // 🎯 If close and not already notified
      if (distanceInMeters <= 500 && !shipment.notifiedNear) {
        console.log(`📢 Agent is within ${distanceInMeters} meters of delivery location.`);

        // Optional email or notification
        // if (shipment.user?.email) {
        //   await sendEmail({
        //     to: shipment.user.email,
        //     subject: 'Your shipment is arriving soon!',
        //     text: `Hi ${shipment.user.name}, your package is almost at your location.`,
        //   });
        // }

        // Mark as notified to prevent duplicates
        shipment.notifiedNear = true;
        await shipment.save();
      }
    }

    res.status(201).json({ message: 'Tracking log updated' });
  } catch (error) {
    console.error('Error in updateLiveLocation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};








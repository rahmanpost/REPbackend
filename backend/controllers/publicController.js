// backend/controllers/publicController.js
import Shipment from '../models/shipment.js';

export const trackShipment = async (req, res) => {
  try {
    const { trackingId } = req.params;

    const shipment = await Shipment.findOne({ trackingId });

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    res.json({
      trackingId: shipment.trackingId,
      status: shipment.status,
      lastUpdated: shipment.updatedAt,
      from: shipment.pickupAddress,
      to: shipment.receiver,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

import Shipment from '../models/shipment.js';

export const trackShipment = async (req, res) => {
  try {
    const { trackingId } = req.params;

    const shipment = await Shipment.findOne({ trackingId })
      .populate('pickupAgent', 'name phone')
      .populate('deliveryAgent', 'name phone');

    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    res.json({
      trackingId: shipment.trackingId,
      status: shipment.status,
      currentLocation: shipment.status === 'delivered' ? 'Delivered' : 'In Transit',
      pickupAgent: shipment.pickupAgent,
      deliveryAgent: shipment.deliveryAgent,
      timestamps: {
        createdAt: shipment.createdAt,
        pickedUpAt: shipment.pickupConfirmedAt,
        deliveredAt: shipment.deliveredAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

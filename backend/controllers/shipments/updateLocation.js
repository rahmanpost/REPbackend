// backend/controllers/shipments/updateShipmentLocation.js
import asyncHandler from 'express-async-handler';
import Shipment from '../../models/shipment.js';
import { isObjectId, httpError } from './_shared.js';

const TERMINAL = new Set(['DELIVERED', 'CANCELLED']);

const asNum = (v) => (v == null ? undefined : Number(v));

const updateShipmentLocation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lat, lng, accuracy, address, note } = req.body || {};

  if (!isObjectId(id)) return httpError(res, 400, 'Invalid shipment id.');

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (
    !Number.isFinite(latNum) ||
    !Number.isFinite(lngNum) ||
    latNum < -90 || latNum > 90 ||
    lngNum < -180 || lngNum > 180
  ) {
    return httpError(res, 400, 'lat and lng must be valid coordinates.');
  }

  const shipment = await Shipment.findById(id);
  if (!shipment) return httpError(res, 404, 'Shipment not found.');

  if (TERMINAL.has(shipment.status)) {
    return httpError(res, 409, `Cannot update location for terminal shipment (${shipment.status}).`);
  }

  shipment.lastLocation = {
    lat: latNum,
    lng: lngNum,
    ...(accuracy != null ? { accuracy: asNum(accuracy) } : {}),
    ...(address ? { address: String(address) } : {}),
    at: new Date(),
    by: req.user?._id,
  };

  shipment.logs = shipment.logs || [];
  shipment.logs.push({
    type: 'LOCATION',
    message: `Location → ${latNum},${lngNum}${address ? ` (${address})` : ''}${note ? ` — ${note}` : ''}`,
    at: new Date(),
    by: req.user?._id,
  });

  await shipment.save();

  return res.json({
    success: true,
    data: {
      _id: shipment._id,
      lastLocation: shipment.lastLocation,
      status: shipment.status,
    },
  });
});

export { updateShipmentLocation };
export default updateShipmentLocation;

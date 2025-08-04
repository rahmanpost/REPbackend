import Shipment from '../models/shipment.js';

export const generateInvoiceNumber = async () => {
  const date = new Date();
  const prefix = `INV-${date.getFullYear()}${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;

  const count = await Shipment.countDocuments({
    createdAt: {
      $gte: new Date(date.setHours(0, 0, 0, 0)),
      $lt: new Date(date.setHours(23, 59, 59, 999)),
    }
  });

  const number = (count + 1).toString().padStart(4, '0');
  return `${prefix}-${number}`; // e.g., INV-20250804-0001
};

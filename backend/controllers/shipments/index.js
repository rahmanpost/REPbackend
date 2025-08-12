// backend/controllers/shipments/index.js
// Unified exports for shipment controllers (supports named or default).

import * as Create from './create.js';
import * as UpdateStatus from './updateStatus.js';
import * as AssignAgent from './assignAgent.js';
import * as GetById from './getById.js';
import * as ListMine from './listMine.js';
import * as Cancel from './cancel.js';
import * as UpdateLocation from './updateLocation.js';
import * as Files from './files.js';
import * as UploadFiles from './uploadFiles.js';
import * as PublicTrack from './publicTrack.js';
import * as PreviewReprice from './previewReprice.js';
import * as Reprice from './reprice.js';


function pick(mod, ...names) {
  for (const n of names) {
    if (mod && Object.prototype.hasOwnProperty.call(mod, n)) return mod[n];
  }
  return mod?.default;
}

// Canonical exports used by routes:
export const createShipment = pick(Create, 'createShipment');
export const updateShipmentStatus = pick(UpdateStatus, 'updateShipmentStatus', 'updateStatus');
export const assignAgent = pick(AssignAgent, 'assignAgent');
export const getShipmentByIdForUser = pick(GetById, 'getShipmentByIdForUser');
export const getMyShipments = pick(ListMine, 'getMyShipments');
export const cancelShipment = pick(Cancel, 'cancelShipment');
export const updateShipmentLocation = pick(UpdateLocation, 'updateShipmentLocation');

// File uploads (present in files.js and/or uploadFiles.js)
export const uploadShipmentFiles =
  pick(Files, 'uploadShipmentFiles') || pick(UploadFiles, 'uploadShipmentFiles');

// Public tracking (if routes import it from here)
export const publicTrack = pick(PublicTrack, 'publicTrack');

// Reprice endpoints (some routes/tests use these names)
export const previewRepriceShipment =
  pick(PreviewReprice, 'previewRepriceShipment') || pick(Reprice, 'previewReprice');
export const repriceShipment = pick(Reprice, 'repriceShipment');

// Helpful aliases some routes/tests may use:
export const getShipmentById = getShipmentByIdForUser;
export const listMyShipments = getMyShipments;



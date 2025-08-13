// backend/controllers/shipments/index.js
// Unified exports for shipment controllers (tolerates named or default exports)

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
import * as Reprice from './reprice.js';
import * as PreviewReprice from './previewReprice.js';


// Prefer named functions; fall back to default if it’s a function.
function pick(mod, ...names) {
  for (const n of names) {
    if (mod && typeof mod[n] === 'function') return mod[n];
  }
  if (mod && typeof mod.default === 'function') return mod.default;
  return undefined;
}

// Canonical exports used by routes
export const createShipment           = pick(Create, 'createShipment');

export const updateShipmentStatus     = pick(UpdateStatus, 'updateShipmentStatus', 'updateStatus');

export const assignAgent              = pick(AssignAgent, 'assignAgent');

export const getShipmentByIdForUser   = pick(GetById, 'getShipmentByIdForUser', 'getShipmentById');

export const getMyShipments           = pick(ListMine, 'getMyShipments', 'listMyShipments');

export const cancelShipment           = pick(Cancel, 'cancelShipment');

export const updateShipmentLocation   = pick(UpdateLocation, 'updateShipmentLocation');

// File uploads (prefer uploadFiles.js, fall back to files.js)
export const uploadShipmentFiles =
  pick(UploadFiles, 'uploadShipmentFiles') ||
  pick(Files, 'uploadShipmentFiles');

// Public tracking (optional)
export const publicTrack              = pick(PublicTrack, 'publicTrack');

// Reprice endpoints: prefer combined reprice.js, fall back to previewReprice.js
export const previewRepriceShipment =
  pick(Reprice, 'previewRepriceShipment', 'previewReprice') ||
  pick(PreviewReprice, 'previewRepriceShipment', 'previewReprice');

export const repriceShipment          = pick(Reprice, 'repriceShipment', 'reprice');

// Helpful aliases
export const getShipmentById          = getShipmentByIdForUser;
export const listMyShipments          = getMyShipments;

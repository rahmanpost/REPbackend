here’s a tight **UPGRADE README** you can drop in as `backend/UPGRADE-README.md`. after it, I’ll answer “is the upgrade complete?”.

---

# Shipment & Pricing Upgrade — Backend

## What changed (at a glance)

* **Agents:** split into `pickupAgent` and `deliveryAgent` (no single `agent` field).
* **Addresses:** required structured `pickupAddress` / `deliveryAddress` (Afghanistan provinces only).
* **Boxes & weights:** `boxType = { kind:'PRESET'| 'CUSTOM', ... }`; volumetric divisor default **5000**. Chargeable = `max(weightKg, volumetricWeightKg)`.
* **Pricing model simplified:** Admin sets **WEIGHT** (perKg) or **VOLUME** (per m³/cm³) with `baseFee`, `minCharge`, `taxPercent`, `volumetricDivisor`. No zones/service multipliers.
* **Charges:** keep only `actualCharges`, `otherCharges`, `tax` (admin applies).
* **Payments:** `payment = { mode: PICKUP|DELIVERY, method: CASH|ONLINE, status: UNPAID|PAID, transactionId? }`.
* **Statuses:**
  `CREATED → PICKUP_SCHEDULED → PICKED_UP → AT_ORIGIN_HUB → IN_TRANSIT → AT_DESTINATION_HUB → OUT_FOR_DELIVERY → DELIVERED`
  plus side paths: `ON_HOLD`, `RETURN_TO_SENDER`, and `CANCELLED`.
* **Public tracking:** `GET /api/public/track/:trackingId` returns status, masked endpoints, milestones, and `lastLocation`.
* **Controller hardening:** write-paths use **atomic updates** to avoid failing on legacy docs missing new required fields.

---

## Files added/updated

### Validators

* `validators/shipmentSchemas.js` (upgraded, legacy fields removed)

### Controllers — Shipments

* `controllers/shipments/create.js`
* `controllers/shipments/getById.js`
* `controllers/shipments/listMine.js`
* `controllers/shipments/cancel.js` *(atomic update)*
* `controllers/shipments/updateStatus.js` *(atomic update + lifecycle enforcement)*
* `controllers/shipments/assignAgent.js` *(pickup/delivery; atomic update)*
* `controllers/shipments/files.js` *(attachments; atomic update)*
* `controllers/shipments/updateLocation.js` *(GPS; atomic update)*
* `controllers/shipments/publicTrack.js`
* `controllers/shipments/reprice.js` *(preview/apply; atomic update)*
* `controllers/shipments/index.js` (barrel)

### Pricing

* `models/pricing.js` (simplified model)
* `utils/boxPresets.js` (your presets #3–#8)
* `utils/computeTotals.js` (volumetric & totals math)
* `controllers/pricingController.js` (CRUD, `getActivePricing`, `getQuote`, `adminQuotePreview`)

### Routes

* `routes/shipmentRoutes.js` (ok as-is; added `PATCH /:id/location` if not present)
* `routes/publicRoutes.js` (replaced; now `/pricing/quote` + `/track/:trackingId`)
* `routes/adminRoutes.js` (pricing routes switched to new controller; repricing preview/apply wired)

### Scripts

* `scripts/bulkReprice.js` (dry-run/apply; uses active pricing)
* *(optional)* `scripts/seedPricing.js` (quick seed of an active pricing)

---

## Run & verify

1. **Install & start**

```bash
cd backend
npm install
npm run dev    # or: node server.js
```

2. **Seed an active pricing (one-time if empty)**

* via API: `POST /api/admin/pricing` (e.g., `{ "mode":"WEIGHT", "perKg":120, "minCharge":150, "active": true }`)
* or run: `node scripts/seedPricing.js`

3. **Bulk reprice legacy shipments (if any show needsReprice=true)**

```bash
node scripts/bulkReprice.js           # dry-run
node scripts/bulkReprice.js --apply   # write charges
```

4. **Smoke tests**

* Create shipment: `POST /api/shipments` with `pickupAddress`, `deliveryAddress`, and `boxType`.
* Assign agents: `PATCH /api/shipments/:id/assign-agent` (`{ "stage":"PICKUP", "agentId":"..." }`).
* Status updates: `PATCH /api/shipments/:id/status` (respect lifecycle; requires reason for `CANCELLED/ON_HOLD/RETURN_TO_SENDER`).
* Upload files: `PUT /api/shipments/:id/files` with `beforePhoto/afterPhoto/receipt`.
* Push location: `PATCH /api/shipments/:id/location` → then `GET /api/public/track/:trackingId`.
* Quotes: `GET /api/public/pricing/quote?boxCode=6&weightKg=5` (or POST body).

---

## Breaking changes

* **Removed legacy fields** on create: `from/to`, `serviceType`, `zoneName`, `items`, `pieces`, `declaredValue`. Use addresses + `boxType`.
* **Single `agent`** field is replaced by `pickupAgent` & `deliveryAgent`.
* **Old public tracking path** `/api/track/:trackingId` is superseded by `/api/public/track/:trackingId`.
* **Old pricing model & routes** (`zones`, `serviceMultipliers`, `getPricingByRoute`) are replaced by simplified pricing and new endpoints.

---

## Legacy data compatibility

* Controllers that modify shipments now use **atomic updates** to avoid Mongoose validation errors on old docs.
* If you ever call `shipment.save()` on a legacy shipment missing `pickupAddress`/`deliveryAddress`/`boxType`, validation will fail. Prefer atomic updates or **backfill** once:

**Quick backfill idea (optional):**

* Map old `from` → `pickupAddress`, `to` → `deliveryAddress` (rename fields).
* If `dimensionsCm` exists and no `boxType`, set `boxType = { kind:'CUSTOM', length, width, height }` from those dims.

---

## Endpoint summary (key ones)

**Public**

* `GET /api/public/pricing/quote` (or `POST`) → `{ success, data: { pricingVersion, totals } }`
* `GET /api/public/track/:trackingId` → `{ success, data: { status, lastLocation, milestones, from, to } }`

**User**

* `POST /api/shipments` *(protected)* Create
* `GET /api/shipments/mine` *(protected)* List my shipments
* `GET /api/shipments/:id` *(protected)* Owner/Admin/Agent read
* `POST|PATCH|DELETE /api/shipments/:id/cancel` *(protected)* Soft cancel

**Agent/Admin**

* `PATCH /api/shipments/:id/status`
* `PATCH /api/shipments/:id/assign-agent`
* `PUT /api/shipments/:id/files`
* `PATCH /api/shipments/:id/location`

**Admin (pricing)**

* `POST /api/admin/pricing` (create)
* `GET /api/admin/pricing` (list)
* `GET /api/admin/pricing/active` (read active)
* `GET /api/admin/pricing/:id` (read)
* `PATCH /api/admin/pricing/:id` (update)
* `PATCH /api/admin/pricing/:id/activate` (activate)
* `DELETE /api/admin/pricing/:id` (archive/soft delete)
* `GET /api/admin/pricing/quote` (admin preview; can pass `pricingVersion`)

**Admin (repricing)**

* `GET /api/admin/shipments/:id/reprice/preview`
* `PATCH /api/admin/shipments/:id/reprice`

---

## Configuration & security notes

* Keep `mongoSanitize5`, rate limits, `protect/isAgent/isAdmin` middleware as you have them.
* `validators/shipmentSchemas.js` controls what’s allowed. We enforce Afghanistan provinces and status lifecycle there.
* Box presets are in `utils/boxPresets.js` (you added dimensions for #3–#8).
* `computeTotals.js` is the single source of truth for volumetric & totals math.

---

## Is the upgrade complete?

**Backend core: yes** — the upgraded validators, controllers, pricing, routes, and scripts are all in place and hardened. You can create new shipments with the **new schema**, manage statuses/agents/files/location, compute quotes, and reprice.

**Recommended final checks (quick):**

* Ensure your **`models/shipment.js`** includes the upgraded fields (`pickupAddress`, `deliveryAddress`, `boxType`, `volumetricWeightKg`, `chargeableWeightKg`, `volumetricDivisor`, `actualCharges`, `otherCharges`, `tax`, `payment`, `pickupAgent`, `deliveryAgent`, `attachments`, `lastLocation`, `locationHistory`, `logs`, `cancellation`).

  * If your current model is older and has strict required fields, keep using our **atomic updates** until you backfill or relax requireds.
* Remove any **legacy controllers/routes** you no longer use (`publicController.js`, `trackingRoutes.js`, old pricing-by-route methods) to avoid confusion.
* Frontend/API clients: update to the **new fields & paths** (addresses, boxType, `/api/public/track/...`, pricing quote endpoints).

If you want, I can quickly skim your `models/shipment.js` and confirm it matches—just paste it here.

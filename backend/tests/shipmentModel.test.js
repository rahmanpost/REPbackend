import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Shipment from '../models/shipment.js';
import { jest } from '@jest/globals';



jest.setTimeout(15000); // 🔧 Increase timeout

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop(); // 💥 Only stop if it's defined
  }});
  

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Shipment Model Test', () => {
  it('should create & save shipment successfully', async () => {
    const validShipment = new Shipment({
      sender: new mongoose.Types.ObjectId(),
      pickupAddress: { addressLine: '123 Main St', city: 'Kabul' },
      pickupTimeSlot: '9am-11am',
      receiver: {
        fullName: 'Receiver Name',
        phoneNumber: '1234567890',
        addressLine: '456 Receiver St',
        city: 'Kabul',
        email: 'receiver@example.com',
      },
      packageDetails: {
        type: 'Document',
        weight: 1.5,
        dimensions: { length: 10, width: 5, height: 2 },
        description: 'Important documents',
        specialInstructions: 'Handle with care',
      },
      payment: {
        payer: 'sender',
        timing: 'pay-in-advance',
        method: 'cash',
        status: 'pending',
      },
      trackingId: 'TRACK12345',
    });
    const savedShipment = await validShipment.save();

    expect(savedShipment._id).toBeDefined();
    expect(savedShipment.pickupAddress.city).toBe('Kabul');
    expect(savedShipment.status).toBe('pickup-scheduled');
    expect(savedShipment.trackingId).toBe('TRACK12345');
  });

  it('should fail without required fields', async () => {
    const shipmentWithoutRequired = new Shipment({});
    let err;
    try {
      await shipmentWithoutRequired.save();
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.errors.sender).toBeDefined();
    expect(err.errors.pickupTimeSlot).toBeDefined();
    expect(err.errors['receiver.fullName']).toBeDefined();
    expect(err.errors['receiver.phoneNumber']).toBeDefined();
    expect(err.errors['pickupAddress.addressLine']).toBeDefined();
    expect(err.errors['pickupAddress.city']).toBeDefined();
    expect(err.errors['packageDetails.type']).toBeDefined();
    expect(err.errors['packageDetails.weight']).toBeDefined();
    expect(err.errors.trackingId).toBeDefined();
  });

  it('should fail with invalid phone number in receiver', async () => {
    const shipment = new Shipment({
      sender: new mongoose.Types.ObjectId(),
      pickupAddress: { addressLine: '123 Main St', city: 'Kabul' },
      pickupTimeSlot: '9am-11am',
      receiver: {
        fullName: 'Receiver Name',
        phoneNumber: 'invalidphone',
        addressLine: '456 Receiver St',
        city: 'Kabul',
        email: 'receiver@example.com',
      },
      packageDetails: {
        type: 'Document',
        weight: 1.5,
      },
      payment: {
        payer: 'sender',
        timing: 'pay-in-advance',
        method: 'cash',
      },
      trackingId: 'TRACK12346',
    });

    let err;
    try {
      await shipment.save();
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.errors['receiver.phoneNumber']).toBeDefined();
  });

  it('should enforce unique trackingId', async () => {
    const shipment1 = new Shipment({
      sender: new mongoose.Types.ObjectId(),
      pickupAddress: { addressLine: '123 Main St', city: 'Kabul' },
      pickupTimeSlot: '9am-11am',
      receiver: {
        fullName: 'Receiver One',
        phoneNumber: '1234567890',
        addressLine: 'Address One',
        city: 'Kabul',
      },
      packageDetails: {
        type: 'Document',
        weight: 1,
      },
      payment: {
        payer: 'sender',
        timing: 'pay-in-advance',
        method: 'cash',
      },
      trackingId: 'TRACK12347',
    });

    await shipment1.save();

    const shipment2 = new Shipment({
      sender: new mongoose.Types.ObjectId(),
      pickupAddress: { addressLine: '456 Main St', city: 'Kabul' },
      pickupTimeSlot: '11am-1pm',
      receiver: {
        fullName: 'Receiver Two',
        phoneNumber: '0987654321',
        addressLine: 'Address Two',
        city: 'Kabul',
      },
      packageDetails: {
        type: 'Document',
        weight: 2,
      },
      payment: {
        payer: 'receiver',
        timing: 'pay-on-delivery',
        method: 'online',
      },
      trackingId: 'TRACK12347', // duplicate
    });

    let err;
    try {
      await shipment2.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeDefined();
    expect(err.code).toBe(11000);
  });
});

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../models/User.js';
import { jest } from '@jest/globals';



jest.setTimeout(15000); // 🔧 Increase timeout

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await User.createIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('User Model Test', () => {
  it('should create & save user successfully', async () => {
    const validUser = new User({
      fullName: 'Test User',
      phoneNumber: '1234567890',
      email: 'test@example.com',
      password: 'password123',
      role: 'user',
    });
    const savedUser = await validUser.save();

    expect(savedUser._id).toBeDefined();
    expect(savedUser.fullName).toBe('Test User');
    expect(savedUser.phoneNumber).toBe('1234567890');
    expect(savedUser.email).toBe('test@example.com');
    expect(savedUser.role).toBe('user');
  });

  it('should fail without required fields', async () => {
    const userWithoutRequiredField = new User({ fullName: 'No Phone' });
    let err;
    try {
      await userWithoutRequiredField.save();
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.errors.phoneNumber).toBeDefined();
    expect(err.errors.password).toBeDefined();
  });

  it('should fail with invalid email', async () => {
    const userWithInvalidEmail = new User({
      fullName: 'Invalid Email',
      phoneNumber: '1234567890',
      email: 'invalidemail',
      password: 'password123',
    });
    let err;
    try {
      await userWithInvalidEmail.save();
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.errors.email).toBeDefined();
  });

  it('should fail with invalid phone number', async () => {
    const userWithInvalidPhone = new User({
      fullName: 'Invalid Phone',
      phoneNumber: 'abc123',
      password: 'password123',
    });
    let err;
    try {
      await userWithInvalidPhone.save();
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.errors.phoneNumber).toBeDefined();
  });

  it('should enforce unique phoneNumber', async () => {
    const user1 = new User({
      fullName: 'User One',
      phoneNumber: '9999999999',
      password: 'password123',
    });
    await user1.save();

    const user2 = new User({
      fullName: 'User Two',
      phoneNumber: '9999999999',
      password: 'password456',
    });
    let err;
    try {
      await user2.save();
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.code).toBe(11000); // Duplicate key error code
  });
});

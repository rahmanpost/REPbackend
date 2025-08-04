import mongoose from 'mongoose';

const pricingSchema = new mongoose.Schema({
  fromProvince: {
    type: String,
    required: true,
    trim: true,
  },
  toProvince: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  }
}, {
  timestamps: true,
});

// Ensure no duplicate route pricing
pricingSchema.index({ fromProvince: 1, toProvince: 1 }, { unique: true });

const Pricing = mongoose.model('Pricing', pricingSchema);
export default Pricing;

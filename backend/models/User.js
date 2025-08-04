import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const addressSchema = new mongoose.Schema({
  province: { type: String, trim: true },
  district: { type: String, trim: true },
  street: { type: String, trim: true },
  details: { type: String, trim: true },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{10,12}$/, 'Phone number must be 10 to 12 digits'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/.+\@.+\..+/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'agent'],
      default: 'user',
    },
    emailVerified: {
  type: Boolean,
  default: false,
},
phoneVerified: {
  type: Boolean,
  default: false,
},
    addresses: [addressSchema],
  },
  { timestamps: true },
  
  {
    emailVerificationToken: String,
emailVerificationExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    profilePicture: { type: String },

  }
);

// ✅ Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ✅ Add method to check password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};


// reset password schema.methods:
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(20).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

  return resetToken;
};



// ✅ Create model
const User = mongoose.model('User', userSchema);
export default User;

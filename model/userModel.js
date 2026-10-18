import mongoose from "mongoose";
import validator from "validator";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, "A username is required"],
      trim: true,
      minlength: [3, "A username must be at least 3 characters"],
      maxlength: [30, "A username cannot exceed 30 characters"],
      match: [/^[a-zA-Z0-9_]+$/, "Use letters, numbers, or underscores only"],
    },
    email: {
      type: String,
      required: [true, "An email address is required"],
      trim: true,
      lowercase: true,
      validate: [validator.isEmail, "Provide a valid email address"],
    },
    passwordHash: {
      type: String,
      required: [true, "A password hash is required"],
      select: false,
    },
    passwordChangedAt: Date,
    ownedQuizzes: {
      type: [{ type: Schema.Types.ObjectId, ref: "Quiz" }],
      default: [],
    },
    completedQuizzes: {
      type: [{ type: Schema.Types.ObjectId, ref: "Quiz" }],
      default: [],
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);

export default User;

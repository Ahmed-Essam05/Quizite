import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../model/userModel.js";
import AppError from "../utils/appError.js";
import catchAsync from "../utils/catchAsync.js";
import sendEmail, { isEmailConfigured } from "../utils/email.js";

const JWT_EXPIRES_IN = "30d";
const PASSWORD_RESET_LIFETIME_MS = 10 * 60 * 1000;

const getJwtSecret = () => process.env.JWT_SECRET || process.env.SUPERSECRETJWT;

export const validatePassword = (password) => {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters long";
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must include at least one letter and one number";
  }

  return null;
};

const signToken = (userId) => {
  const secret = getJwtSecret();
  if (!secret) {
    throw new AppError("JWT secret is not configured", 500);
  }

  return jwt.sign({ id: userId }, secret, { expiresIn: JWT_EXPIRES_IN });
};

export const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  res.cookie("jwt", token, cookieOptions);

  // Set user cookie so client knows who is logged in via cookie (without localStorage)
  res.cookie(
    "quizite_user",
    JSON.stringify({ id: user._id, username: user.username }),
    {
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  );

  return res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    },
  });
};

export const protect = catchAsync(async (req, res, next) => {
  let token;
  const authorization = req.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    token = authorization.slice(7);
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError("Please log in to access this resource", 401));
  }

  const secret = getJwtSecret();
  if (!secret) {
    return next(new AppError("JWT secret is not configured", 500));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (error) {
    return next(new AppError("Invalid or expired login token", 401));
  }

  const user = await User.findById(decoded.id).select("+isActive");
  if (!user || !user.isActive) {
    return next(new AppError("The account for this token is unavailable", 401));
  }

  const passwordChangedAtSeconds = user.passwordChangedAt
    ? Math.floor(user.passwordChangedAt.getTime() / 1000)
    : null;
  if (passwordChangedAtSeconds && passwordChangedAtSeconds > decoded.iat) {
    return next(new AppError("Password changed; please log in again", 401));
  }

  req.user = user;
  return next();
});

export const protectPage = async (req, res, next) => {
  try {
    let token;
    const authorization = req.headers.authorization;

    if (authorization?.startsWith("Bearer ")) {
      token = authorization.slice(7);
    } else if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }

    if (!token || token === "loggedout") {
      return res.redirect("/login");
    }

    const secret = getJwtSecret();
    if (!secret) {
      return res.redirect("/login");
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch {
      return res.redirect("/login");
    }

    const user = await User.findById(decoded.id).select("+isActive");
    if (!user || !user.isActive) {
      return res.redirect("/login");
    }

    const passwordChangedAtSeconds = user.passwordChangedAt
      ? Math.floor(user.passwordChangedAt.getTime() / 1000)
      : null;
    if (passwordChangedAtSeconds && passwordChangedAtSeconds > decoded.iat) {
      return res.redirect("/login");
    }

    req.user = user;
    return next();
  } catch {
    return res.redirect("/login");
  }
};

export const optionalAuth = catchAsync(async (req, res, next) => {
  let token;
  const authorization = req.headers.authorization;

  if (authorization?.startsWith("Bearer ")) {
    token = authorization.slice(7);
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) return next();

  const secret = getJwtSecret();
  if (!secret) return next();

  try {
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id).select("+isActive");
    if (user && user.isActive) {
      const passwordChangedAtSeconds = user.passwordChangedAt
        ? Math.floor(user.passwordChangedAt.getTime() / 1000)
        : null;
      if (
        !passwordChangedAtSeconds ||
        passwordChangedAtSeconds <= decoded.iat
      ) {
        req.user = user;
      }
    }
  } catch (err) {
    // Ignore invalid/expired token in optionalAuth
  }

  return next();
});

export const signup = catchAsync(async (req, res, next) => {
  const { username, email, password } = req.body;
  const passwordError = validatePassword(password);

  if (passwordError) {
    return next(new AppError(passwordError, 400));
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ username, email, passwordHash });

  return sendToken(user, 201, res);
});

export const login = catchAsync(async (req, res, next) => {
  const { username, password } = req.body;

  if (typeof username !== "string" || typeof password !== "string") {
    return next(new AppError("Provide a username and password", 400));
  }

  const user = await User.findOne({ username: username.trim() }).select(
    "+passwordHash +isActive",
  );
  const passwordIsCorrect =
    user && (await bcrypt.compare(password, user.passwordHash));

  if (!passwordIsCorrect || !user.isActive) {
    return next(new AppError("Incorrect username or password", 401));
  }

  return sendToken(user, 200, res);
});

export const resetPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (typeof email !== "string" || !email.trim()) {
    return next(new AppError("Provide an email address", 400));
  }

  if (!isEmailConfigured()) {
    return next(new AppError("Password-reset email is not configured", 503));
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    "+passwordResetTokenHash +passwordResetExpiresAt",
  );

  if (user) {
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.passwordResetExpiresAt = new Date(
      Date.now() + PASSWORD_RESET_LIFETIME_MS,
    );
    await user.save({ validateBeforeSave: false });

    const resetUrl = process.env.PASSWORD_RESET_URL
      ? `${process.env.PASSWORD_RESET_URL}?token=${resetToken}`
      : `Use this password-reset token: ${resetToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: "Quiz Website password reset (valid for 10 minutes)",
        text: `You requested a password reset. ${resetUrl}`,
      });
    } catch (error) {
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save({ validateBeforeSave: false });
      return next(new AppError("Unable to send the password-reset email", 503));
    }
  }

  return res.status(200).json({
    status: "success",
    message: "If an account exists for that email, a reset message was sent.",
  });
});

export const updatePassword = catchAsync(async (req, res, next) => {
  const { token, password } = req.body;
  const passwordError = validatePassword(password);

  if (typeof token !== "string" || !token) {
    return next(new AppError("Provide a reset token", 400));
  }

  if (passwordError) {
    return next(new AppError(passwordError, 400));
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetExpiresAt");

  if (!user) {
    return next(new AppError("Reset token is invalid or has expired", 400));
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordChangedAt = new Date();
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  return sendToken(user, 200, res);
});

export const logout = (req, res) => {
  const cookieOptions = {
    expires: new Date(0),
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  res.cookie("jwt", "", cookieOptions);
  res.cookie("quizite_user", "", cookieOptions);
  return res.status(200).json({ status: "success" });
};

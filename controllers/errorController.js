import AppError from "../utils/appError.js";

const handleCastErrorDB = (err) => {
  const message = `invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const entry = Object.entries(err.keyValue || {})[0];
  const message = entry
    ? `there is already a record with this ${entry[0]}: ${entry[1]}`
    : "there is already a record with these details";
  return new AppError(message, 400);
};

const handleValidatorErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = errors.join(" and ");
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError("invalid token, please log in again", 401);

const handleJWTExpired = () =>
  new AppError("Your token has expiered! please log in again.", 401);

const sendErrorDev = (err, req, res) => {
  if (req.originalUrl.startsWith("/api")) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }
  console.error(err);
  return res.status(err.statusCode).render("error", {
    title: "something went wrong",
    msg: err.message,
  });
};

const sendErrorProd = (err, req, res) => {
  // A) API
  if (req.originalUrl.startsWith("/api")) {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
      // Programming or other unknown error: don't leak error details
    }
    // B) Log error
    console.error("ERROR 💥", err);

    // C) Send generic message
    return res.status(500).json({
      status: "error",
      message: "Something went very wrong!",
    });
  }
  // B) RENDERED WEBSITE
  if (err.isOperational) {
    return res.status(err.statusCode).render("error", {
      title: "Something went wrong!",
      msg: err.message,
    });
  }

  // Programming or other unknown error: don't leak error details

  // 1) Log error
  console.error("ERROR 💥", err);

  // 2) Send generic message
  return res.status(err.statusCode).render("error", {
    title: "Something went wrong!",
    msg: "Please try again later.",
  });
};

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "Error";

  let error = err;

  if (error.name === "CastError") error = handleCastErrorDB(error);
  else if (error.code === 11000) error = handleDuplicateFieldsDB(error);
  else if (error.name === "JsonWebTokenError") error = handleJWTError();
  else if (error.name === "TokenExpiredError") error = handleJWTExpired();
  else if (error.name === "ValidationError")
    error = handleValidatorErrorDB(error);

  if (process.env.NODE_ENV === "production") {
    sendErrorProd(error, req, res);
  } else {
    sendErrorDev(error, req, res);
  }
};

export default errorHandler;

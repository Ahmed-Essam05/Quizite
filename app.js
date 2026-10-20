import express from "express";
import morgan from "morgan";
import path from "path";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import compression from "compression";

import AppError from "./utils/appError.js";
import globalErrorHandler from "./controllers/errorController.js";
import { protectPage } from "./controllers/authController.js";
import authRouter from "./routes/authRoute.js";
import overviewRouter from "./routes/overviewRoute.js";
import quizRouter from "./routes/quizRoute.js";
import userRouter from "./routes/userRoute.js";

import __dirname from "./dirname.js";

const app = express();

// MIDDLEWARES...

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  }),
);

app.use(cookieParser());

// Frontend assets are deliberately served before API middleware so rendering the
// overview never depends on database connectivity or request-body processing.
const frontendDir = path.join(__dirname, "frontend");
const pagesDir = path.join(frontendDir, "pages");

app.use("/css", express.static(path.join(frontendDir, "css")));
app.use("/js", express.static(path.join(frontendDir, "js")));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "1y",
    immutable: true,
  }),
);

// The pages used to be served from the frontend root. Keep old bookmarked
// .html paths working while the canonical page URLs stay unchanged.
const legacyPageRedirects = {
  "overview.html": "/",
  "login.html": "/login",
  "signup.html": "/signup",
  "create.html": "/create",
  "profile.html": "/profile",
  "quiz.html": "/",
  "results.html": "/",
  "public-profile.html": "/",
};

app.get(
  Object.keys(legacyPageRedirects).map((file) => `/${file}`),
  (req, res) => {
    res.redirect(301, legacyPageRedirects[req.path.slice(1)] || "/");
  },
);

app.get("/", (req, res) => {
  res.sendFile(path.join(pagesDir, "overview.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(pagesDir, "login.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(pagesDir, "signup.html"));
});

app.get("/create", protectPage, (req, res) => {
  res.sendFile(path.join(pagesDir, "create.html"));
});

app.get("/profile", protectPage, (req, res) => {
  res.sendFile(path.join(pagesDir, "profile.html"));
});

app.get("/users/:username", (req, res) => {
  res.sendFile(path.join(pagesDir, "public-profile.html"));
});

app.get("/quiz/:id/edit", protectPage, (req, res) => {
  res.sendFile(path.join(pagesDir, "create.html"));
});

app.get("/quiz/:id/results", (req, res) => {
  res.sendFile(path.join(pagesDir, "results.html"));
});

app.get("/quiz/:id", protectPage, (req, res) => {
  res.sendFile(path.join(pagesDir, "quiz.html"));
});

//limit request from same api
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests from this ip, please try again in an hour!",
  skip: () => process.env.NODE_ENV === "test",
});

app.use("/api", limiter);

//body parser, reading data from body into req.body
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

//data senitization against NoSQL query injection
app.use(mongoSanitize());

//data senitization against XSS
app.use(xss());

// prevent parameter pollution
app.use(
  hpp({
    whitelist: [],
  }),
);

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(compression());

app.use("/api/auth", authRouter);
app.use("/api/overview", overviewRouter);
app.use("/api/users", userRouter);
app.use("/api/quizzes", quizRouter);

app.all("*", (req, res, next) => {
  next(new AppError(`couldn't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

export default app;

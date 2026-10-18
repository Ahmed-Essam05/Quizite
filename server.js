import dotenv from "dotenv";
import Mongoose from "mongoose";
import app from "./app.js";

process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT EXCEPTION");
  console.log(err.name, err.message);
  process.exit(1);
});

dotenv.config({ path: "./config.env" });

const DB = process.env.DATABASELINK;

Mongoose.connect(DB, {
  useNewUrlParser: true,
  useCreateIndex: true,
  useFindAndModify: false,
}).then(() => {
  console.log("DB CONNECTED SUCCESSFULLY");
});

const port = process.env.PORT;

const server = app.listen(port, () => {
  console.log(`app running on port ${port}...`);
});

process.on("unhandledRejection", (err) => {
  console.log("UNHANDLED REJECTION");
  console.log(err.name);
  server.close(() => process.exit(1));
});

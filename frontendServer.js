import dotenv from "dotenv";

import app from "./app.js";

dotenv.config({ path: "./config.env" });

const port = Number(process.env.WEB_PORT) || 4173;

app.listen(port, "127.0.0.1", () => {
  console.log(`Frontend preview running at http://localhost:${port}/`);
});

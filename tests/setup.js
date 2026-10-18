import fs from "node:fs";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "quizite-test-secret";

if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync("/usr/bin/mongod")) {
  process.env.MONGOMS_SYSTEM_BINARY = "/usr/bin/mongod";
}

for (const key of [
  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_USERNAME",
  "EMAIL_PASSWORD",
  "EMAIL_FROM",
]) {
  delete process.env[key];
}

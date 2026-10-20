import crypto from "node:crypto";

import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import app from "../app.js";
import User from "../model/userModel.js";
import { clearTestDB, connectTestDB, disconnectTestDB } from "./helpers/db.js";
import { registerAgent } from "./helpers/factories.js";

describe("Authentication", () => {
  let server;

  beforeAll(async () => {
    await connectTestDB();
    server = app.listen(0);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  describe("POST /api/auth/signup", () => {
    it("creates an account and never returns the password hash", async () => {
      const response = await request(server).post("/api/auth/signup").send({
        username: "alice",
        email: "Alice@Example.com",
        password: "password123",
      });

      expect(response.status).toBe(201);
      expect(response.body.data.user.username).toBe("alice");
      expect(response.body.data.user.email).toBe("alice@example.com");
      expect(JSON.stringify(response.body)).not.toContain("passwordHash");

      const cookies = response.headers["set-cookie"].join(";");
      expect(cookies).toContain("jwt=");
      expect(cookies).toContain("quizite_user=");
    });

    it("rejects weak passwords", async () => {
      const response = await request(server).post("/api/auth/signup").send({
        username: "alice",
        email: "alice@example.com",
        password: "short",
      });

      expect(response.status).toBe(400);
    });

    it("rejects duplicate usernames", async () => {
      await request(server).post("/api/auth/signup").send({
        username: "alice",
        email: "alice@example.com",
        password: "password123",
      });

      const response = await request(server).post("/api/auth/signup").send({
        username: "alice",
        email: "other@example.com",
        password: "password123",
      });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await request(server).post("/api/auth/signup").send({
        username: "alice",
        email: "alice@example.com",
        password: "password123",
      });
    });

    it("logs in with valid credentials", async () => {
      const response = await request(server).post("/api/auth/login").send({
        username: "alice",
        password: "password123",
      });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
    });

    it("rejects an incorrect password", async () => {
      const response = await request(server).post("/api/auth/login").send({
        username: "alice",
        password: "wrong-password",
      });

      expect(response.status).toBe(401);
    });
  });

  describe("protect middleware", () => {
    it("rejects unauthenticated access", async () => {
      const response = await request(server).get("/api/overview");
      expect(response.status).toBe(401);
    });

    it("allows authenticated access through the cookie", async () => {
      const { agent } = await registerAgent({}, server);
      const response = await agent.get("/api/overview");
      expect(response.status).toBe(200);
    });

    it("rejects a token whose password was changed", async () => {
      const { agent, response: signupResponse } = await registerAgent({}, server);
      const token = signupResponse.body.token;

      await User.updateOne(
        { username: "tester" },
        { passwordChangedAt: new Date(Date.now() + 5000) },
      );

      const response = await request(server)
        .get("/api/overview")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(agent).toBeTruthy();
    });
  });

  describe("protected pages", () => {
    it("redirects anonymous quiz pages to login with the intended destination", async () => {
      const quizId = "64b000000000000000000001";
      const target = `/quiz/${quizId}?from=share`;
      const response = await request(server).get(target);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(
        `/login?next=${encodeURIComponent(target)}`,
      );
    });

    it("serves protected page shells from the relocated pages directory", async () => {
      const { agent } = await registerAgent({}, server);
      const routes = [
        ["/create", 'id="quiz-title"'],
        ["/profile", 'id="profile-content"'],
        ["/quiz/abc/edit", 'id="quiz-title"'],
        ["/quiz/abc", 'id="quiz-container"'],
      ];

      for (const [route, marker] of routes) {
        const response = await agent.get(route);
        expect(response.status, route).toBe(200);
        expect(response.headers["content-type"], route).toContain("text/html");
        expect(response.text, route).toContain(marker);
      }
    });

    it("redirects other protected pages and leaves public pages alone", async () => {
      const create = await request(server).get("/create");
      expect(create.status).toBe(302);
      expect(create.headers.location).toBe(
        `/login?next=${encodeURIComponent("/create")}`,
      );

      const profile = await request(server).get("/profile");
      expect(profile.status).toBe(302);
      expect(profile.headers.location).toBe(
        `/login?next=${encodeURIComponent("/profile")}`,
      );

      const edit = await request(server).get("/quiz/abc/edit");
      expect(edit.status).toBe(302);
      expect(edit.headers.location).toBe(
        `/login?next=${encodeURIComponent("/quiz/abc/edit")}`,
      );

      const login = await request(server).get("/login");
      expect(login.status).toBe(200);

      const results = await request(server).get("/quiz/abc/results");
      expect(results.status).toBe(200);

      const publicProfile = await request(server).get("/users/alice");
      expect(publicProfile.status).toBe(200);
    });
  });

  describe("password reset", () => {
    it("returns 503 when email delivery is not configured", async () => {
      const { agent } = await registerAgent({}, server);
      expect(agent).toBeTruthy();

      const response = await request(server)
        .post("/api/auth/reset-password")
        .send({ email: "tester@example.com" });

      expect(response.status).toBe(503);
    });

    it("resets the password with a valid, unexpired token", async () => {
      await registerAgent({}, server);
      const rawToken = "valid-reset-token";
      await User.updateOne(
        { username: "tester" },
        {
          passwordResetTokenHash: crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex"),
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        },
      );

      const response = await request(server)
        .post("/api/auth/update-password")
        .send({ token: rawToken, password: "newPassword123" });

      expect(response.status).toBe(200);

      const login = await request(server)
        .post("/api/auth/login")
        .send({ username: "tester", password: "newPassword123" });
      expect(login.status).toBe(200);

      const oldLogin = await request(server)
        .post("/api/auth/login")
        .send({ username: "tester", password: "password123" });
      expect(oldLogin.status).toBe(401);

      const user = await User.findOne({ username: "tester" }).select(
        "+passwordResetTokenHash +passwordResetExpiresAt",
      );
      expect(user.passwordResetTokenHash).toBeUndefined();
    });

    it("rejects expired reset tokens", async () => {
      await registerAgent({}, server);
      const rawToken = "expired-reset-token";
      await User.updateOne(
        { username: "tester" },
        {
          passwordResetTokenHash: crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex"),
          passwordResetExpiresAt: new Date(Date.now() - 60_000),
        },
      );

      const response = await request(server)
        .post("/api/auth/update-password")
        .send({ token: rawToken, password: "newPassword123" });

      expect(response.status).toBe(400);
    });

    it("rejects unknown reset tokens", async () => {
      await registerAgent({}, server);

      const response = await request(server)
        .post("/api/auth/update-password")
        .send({ token: "not-a-real-token", password: "newPassword123" });

      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /api/users/me/password", () => {
    it("requires authentication", async () => {
      const response = await request(server)
        .patch("/api/users/me/password")
        .send({ currentPassword: "password123", newPassword: "newPassword123" });

      expect(response.status).toBe(401);
    });

    it("rejects an incorrect current password", async () => {
      const { agent } = await registerAgent({}, server);

      const response = await agent
        .patch("/api/users/me/password")
        .send({
          currentPassword: "wrong-password",
          newPassword: "newPassword123",
        });

      expect(response.status).toBe(401);
    });

    it("changes the password and keeps the session usable", async () => {
      const { agent } = await registerAgent({}, server);

      const response = await agent
        .patch("/api/users/me/password")
        .send({
          currentPassword: "password123",
          newPassword: "newPassword123",
        });

      expect(response.status).toBe(200);

      const overview = await agent.get("/api/overview");
      expect(overview.status).toBe(200);

      const login = await request(server)
        .post("/api/auth/login")
        .send({ username: "tester", password: "newPassword123" });
      expect(login.status).toBe(200);
    });
  });

  describe("GET /api/users/me", () => {
    it("returns profile data without password or reset-token fields", async () => {
      const { agent } = await registerAgent({}, server);

      const response = await agent.get("/api/users/me");

      expect(response.status).toBe(200);
      expect(response.body.data.user.username).toBe("tester");
      expect(response.body.data.user.email).toBe("tester@example.com");
      expect(response.body.data.stats.quizCount).toBe(0);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toContain("passwordResetTokenHash");
      expect(serialized).not.toContain("isActive");
    });
  });
});

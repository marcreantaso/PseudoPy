"use strict";
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const { DomainError, publicUser } = require("./academic-service");
const digest = (x) => crypto.createHash("sha256").update(x).digest("hex");
const equal = (a, b) => {
  const x = Buffer.from(String(a || "")),
    y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
async function passwordFields(password) {
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 256
  )
    throw new DomainError(400, "Use a password of 10–256 characters.");
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  return {
    passwordSalt,
    passwordHash: (await scrypt(password, passwordSalt, 64)).toString("hex"),
    passwordAlgorithm: "scrypt",
  };
}
async function verifies(user, password) {
  if (!user) return false;
  if (user.passwordAlgorithm === "scrypt")
    return equal(
      (await scrypt(password, user.passwordSalt, 64)).toString("hex"),
      user.passwordHash,
    );
  return user.passwordHash && user.passwordSalt
    ? equal(digest(password + user.passwordSalt), user.passwordHash)
    : equal(user.password, password);
}
const safe = (u) => ({
  ...publicUser(u),
  email: u.email || "",
  timezone: u.timezone || "UTC",
  createdAt: u.createdAt,
  lastLogin: u.lastLogin,
});
function auth(store) {
  return {
    async login(input, ip) {
      const username = String(input.username || "").trim(),
        password = input.password;
      if (
        !username ||
        typeof password !== "string" ||
        !password ||
        password.length > 256
      )
        throw new DomainError(400, "Enter your username and password.");
      const result = await store.transact(async (s) => {
        const now = Date.now(),
          limitId = digest(ip);
        s.limits = s.limits.filter((l) => l.until > now);
        let limit = s.limits.find((l) => l.id === limitId);
        if (!limit) {
          limit = { id: limitId, count: 0, until: now + 900000 };
          s.limits.push(limit);
        }
        if (limit.until < now) {
          limit.count = 0;
          limit.until = now + 900000;
        }
        if (limit.count >= 10)
          return {
            error: "Too many sign-in attempts. Try again in 15 minutes.",
            status: 429,
          };
        const aliases = {
          admin: "mbautista_admin",
          emirandila_student: "emirandilla_student",
          mdaet_stude: "mdaet_student",
        };
        const u =
          s.users.find((u) => u.username === username) ||
          s.users.find((u) => u.username === aliases[username]);
        limit.count++;
        if (!(await verifies(u, password)))
          return { error: "Invalid username or password.", status: 401 };
        if (
          u.status !== "active" ||
          !["student", "instructor", "admin"].includes(u.role)
        )
          return {
            error: "Your account is inactive. Contact your administrator.",
            status: 403,
          };
        let device = null;
        if (u.role === "instructor") {
          const deviceId = String(input.deviceId || "");
          if (!/^[A-Za-z0-9_-]{8,120}$/.test(deviceId))
            return {
              error: "A valid device identifier is required.",
              status: 400,
            };
          const devices = s.devices.filter(
            (d) => d.userId === u.id || d.username === u.username,
          );
          device = devices.find((d) => d.deviceId === deviceId);
          if (!device) {
            device = {
              id: crypto.randomUUID(),
              userId: u.id,
              username: u.username,
              deviceId,
              deviceName: String(input.deviceName || "Browser").slice(0, 150),
              status: devices.length ? "pending" : "approved",
              requestedAt: new Date().toISOString(),
              approvedBy: devices.length ? null : "System Auto-Enroll",
            };
            s.devices.push(device);
          }
          if (device.status !== "approved")
            return {
              error:
                device.status === "pending"
                  ? "This device is awaiting administrator approval."
                  : "This device has been revoked.",
              status: 403,
            };
          device.lastSeenAt = new Date().toISOString();
        }
        // Upgrade existing SHA-256/plaintext credentials only after a successful sign-in.
        if (u.passwordAlgorithm !== "scrypt") {
          const salt = crypto.randomBytes(16).toString("hex");
          u.passwordHash = (await scrypt(password, salt, 64)).toString("hex");
          u.passwordSalt = salt;
          u.passwordAlgorithm = "scrypt";
          delete u.password;
        }
        limit.count = 0;
        u.lastLogin = new Date().toISOString();
        const token = crypto.randomBytes(32).toString("hex");
        s.sessions = s.sessions.filter((t) => t.expiresAt > now);
        s.sessions.push({
          id: digest(token),
          userId: u.id,
          deviceId: device?.deviceId || null,
          expiresAt: now + 8 * 3600000,
        });
        return { token, user: safe(u) };
      });
      if (result.error) throw new DomainError(result.status, result.error);
      return result;
    },
    async session(token) {
      if (!token) throw new DomainError(401, "Please sign in.");
      return store.transact((s) => {
        const session = s.sessions.find(
          (t) => t.id === digest(token) && t.expiresAt > Date.now(),
        );
        const u =
          session &&
          s.users.find((u) => u.id === session.userId && u.status === "active");
        if (!u)
          throw new DomainError(
            401,
            "Your session has expired. Please sign in.",
          );
        if (
          u.role === "instructor" &&
          !s.devices.some(
            (d) =>
              d.userId === u.id &&
              d.deviceId === session.deviceId &&
              d.status === "approved",
          )
        )
          throw new DomainError(403, "Device access revoked.");
        return safe(u);
      });
    },
    async logout(token) {
      await store.transact((s) => {
        s.sessions = s.sessions.filter((t) => t.id !== digest(token || ""));
      });
    },
    async account(actor, action, input) {
      return store.transact(async (s) => {
        const u = s.users.find(
          (u) => u.id === actor.id && u.status === "active",
        );
        if (!u) throw new DomainError(401, "Session expired.");
        const admin = () => {
          if (u.role !== "admin")
            throw new DomainError(403, "Administrator access required.");
        };
        if (action === "users") {
          admin();
          return s.users.map(safe);
        }
        if (action === "devices") {
          admin();
          return s.devices;
        }
        if (action === "audit") {
          admin();
          return s.audit.slice(-200).reverse();
        }
        if (action === "device") {
          admin();
          const d = s.devices.find((d) => d.id === input.id);
          if (!d) throw new DomainError(404, "Device not found.");
          if (!["approved", "revoked"].includes(input.status))
            throw new DomainError(400, "Invalid device status.");
          d.status = input.status;
          d.approvedBy = u.id;
          d.approvedAt = new Date().toISOString();
          s.audit.push({
            id: crypto.randomUUID(),
            actor: u.id,
            event: "device_" + d.status,
            target: d.id,
            timestamp: new Date().toISOString(),
          });
          return d;
        }
        if (action === "settings") {
          try {
            new Intl.DateTimeFormat("en", { timeZone: input.timezone });
          } catch {
            throw new DomainError(400, "Invalid timezone.");
          }
          u.timezone = input.timezone || "UTC";
          return safe(u);
        }
        if (action === "password") {
          if (!(await verifies(u, input.currentPassword || "")))
            throw new DomainError(403, "Current password is incorrect.");
          Object.assign(u, await passwordFields(input.password));
          delete u.password;
          s.sessions = s.sessions.filter((t) => t.userId !== u.id);
          return { message: "Password updated. Sign in again." };
        }
        if (action === "saveUser") {
          admin();
          let target = input.id ? s.users.find((t) => t.id === input.id) : null;
          if (input.id && !target)
            throw new DomainError(404, "User not found.");
          if (
            target?.id === u.id &&
            (input.status !== "active" || input.role !== "admin")
          )
            throw new DomainError(
              400,
              "You cannot remove your own administrator access.",
            );
          if (
            !["student", "instructor", "admin"].includes(input.role) ||
            !["active", "inactive", "archived"].includes(input.status)
          )
            throw new DomainError(400, "Invalid role or status.");
          const username = String(input.username || "").trim();
          if (
            !/^[a-zA-Z0-9_.@-]{3,100}$/.test(username) ||
            !String(input.fullName || "").trim()
          )
            throw new DomainError(400, "Provide a name and valid username.");
          if (
            s.users.some((t) => t.id !== target?.id && t.username === username)
          )
            throw new DomainError(409, "Username already exists.");
          const fields = {
            username,
            fullName: String(input.fullName).trim().slice(0, 150),
            studentId: String(input.studentId || "").slice(0, 100),
            email: String(input.email || "").slice(0, 200),
            role: input.role,
            status: input.status,
          };
          if (!target || input.password)
            Object.assign(fields, await passwordFields(input.password));
          if (!target) {
            target = {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              createdBy: u.id,
            };
            s.users.push(target);
          }
          Object.assign(target, fields);
          if (fields.passwordHash) delete target.password;
          if (input.password || target.status !== "active")
            s.sessions = s.sessions.filter((t) => t.userId !== target.id);
          s.audit.push({
            id: crypto.randomUUID(),
            actor: u.id,
            event: "account_updated",
            target: target.id,
            timestamp: new Date().toISOString(),
          });
          return safe(target);
        }
        throw new DomainError(404, "Unknown account action.");
      });
    },
  };
}
module.exports = { auth, passwordFields, safe, digest };

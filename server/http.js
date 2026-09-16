"use strict";
const express = require("express");
const path = require("node:path");
const { service, DomainError } = require("./academic-service");
const { auth } = require("./auth");
function createApp(
  store,
  { secureCookies = process.env.NODE_ENV === "production" } = {},
) {
  const app = express();
  const accounts = auth(store);
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "180kb" }));
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store");
      if (req.method === "POST" && req.headers["x-pseudopy-client"] !== "1")
        return res
          .status(403)
          .json({ error: "Same-origin application request required." });
      if (
        req.headers.origin &&
        req.headers.origin !== `${req.protocol}://${req.get("host")}`
      )
        return res.status(403).json({ error: "Cross-origin request denied." });
    }
    next();
  });
  const token = (req) =>
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("pseudopy_session="))
      ?.slice("pseudopy_session=".length);
  const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch(next);
  const cookie = (res, value) =>
    res.cookie("pseudopy_session", value, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      path: "/",
      maxAge: value ? 8 * 3600000 : 0,
    });
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.post(
    "/api/auth/login",
    wrap(async (req, res) => {
      const r = await accounts.login(req.body, req.ip);
      cookie(res, r.token);
      res.json(r.user);
    }),
  );
  app.get(
    "/api/auth/session",
    wrap(async (req, res) => res.json(await accounts.session(token(req)))),
  );
  app.post(
    "/api/auth/logout",
    wrap(async (req, res) => {
      await accounts.logout(token(req));
      cookie(res, "");
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/account/:action",
    wrap(async (req, res) => {
      const actor = await accounts.session(token(req));
      res.json(await accounts.account(actor, req.params.action, req.body));
    }),
  );
  app.post(
    "/api/academic/:action",
    wrap(async (req, res) => {
      const actor = await accounts.session(token(req));
      const result = await store.transact((s) => {
        const fresh = s.users.find(
          (u) => u.id === actor.id && u.status === "active",
        );
        if (!fresh) throw new DomainError(401, "Account unavailable.");
        return service(s, fresh, s.users)(
          req.params.action,
          req.body,
          req.get("Idempotency-Key"),
        );
      });
      res.json(result);
    }),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  const root = path.resolve(__dirname, "..");
  // Explicit public assets: never serve credentials, server modules, data, or tests.
  for (const file of [
    "academic.js",
    "offline.html",
    "offline.js",
    "offline-metrics.js",
    "academic.css",
    "compiler.js",
    "mapper.js",
    "execution-worker.js",
    "sw.js",
    "manifest.json",
  ])
    app.get("/" + file, (req, res) => res.sendFile(path.join(root, file)));
  app.use(
    "/icons",
    express.static(path.join(root, "icons"), { dotfiles: "deny" }),
  );
  app.use(
    "/vendor",
    express.static(path.join(root, "vendor"), { dotfiles: "deny" }),
  );
  app.get("/index.html", (req, res) =>
    res.sendFile(path.join(root, "index.html")),
  );
  app.get(/^\/(?:$|(?:student|instructor|admin)(?:\/.*)?$)/, (req, res) =>
    res.sendFile(path.join(root, "index.html")),
  );
  app.use((req, res) => res.status(404).send("Not found"));
  app.use((err, req, res, next) => {
    const status = err.status || 503;
    if (!(err instanceof DomainError) && status !== 400)
      console.error("[PseudoPy]", err.code || err.name);
    res.status(status).json({
      error:
        err instanceof DomainError
          ? err.message
          : status === 400
            ? "Invalid request."
            : "The data service is unavailable. Your work has not been submitted. Please retry.",
    });
  });
  return app;
}
module.exports = { createApp };

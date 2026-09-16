const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { compareReference } = require("../offline-metrics");
test("reference metrics count repeated lines at most their ground-truth frequency", () => {
  const score = compareReference("print(1)\nprint(1)", "print(1)");
  assert.equal(score.matchingLines, 1);
  assert.equal(score.precision, 0.5);
  assert.equal(score.recall, 1);
  assert.equal(score.exact, false);
});
test("reference metrics preserve indentation and avoid division by zero", () => {
  assert.equal(compareReference("print(1)  \r\n", "print(1)").exact, true);
  assert.equal(compareReference("  print(1)", "print(1)").exact, false);
  assert.equal(compareReference("", "print(1)").f1, 0);
});
test("offline cache contains local compiler/runtime and never intercepts API data", async () => {
  const handlers = {},
    assets = [];
  const context = {
    URL,
    Set,
    self: {
      registration: { scope: "https://example.test/" },
      location: { origin: "https://example.test" },
      addEventListener: (name, fn) => (handlers[name] = fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => ({
        addAll: async (list) => assets.push(...list),
        match: async () => "cached asset",
      }),
      keys: async () => [],
      match: async () => "offline lab",
    },
    fetch: async () => {
      throw Error("offline");
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8"),
    context,
  );
  let installation;
  handlers.install({ waitUntil: (p) => (installation = p) });
  await installation;
  assert.ok(assets.includes("./compiler.js"));
  assert.ok(assets.includes("./vendor/skulpt.min.js"));
  assert.ok(!assets.includes("./index.html"));
  let handled = false;
  handlers.fetch({
    request: { method: "GET", url: "https://example.test/api/auth/session" },
    respondWith: () => (handled = true),
  });
  assert.equal(handled, false);
  let navigation;
  handlers.fetch({
    request: {
      method: "GET",
      url: "https://example.test/student/tasks",
      mode: "navigate",
    },
    respondWith: (p) => (navigation = p),
  });
  assert.equal(await navigation, "offline lab");
});

const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const { PseudocodeCompiler } = require("../compiler");
const root = path.join(__dirname, "..");
function execute(pseudocode, input = []) {
  const code = new PseudocodeCompiler().compile(
    "BEGIN\n" + pseudocode + "\nEND",
  ).python;
  return new Promise((resolve, reject) => {
    const ctx = {
      console,
      setTimeout,
      clearTimeout,
      performance,
      Promise,
      self: {
        postMessage: (r) => {
          if (r && typeof r.success === "boolean") resolve(r);
        },
      },
    };
    ctx.postMessage = ctx.self.postMessage;
    ctx.self = ctx;
    vm.createContext(ctx);
    ctx.importScripts = (...files) =>
      files.forEach((file) =>
        vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx),
      );
    try {
      vm.runInContext(
        fs.readFileSync(path.join(root, "execution-worker.js"), "utf8"),
        ctx,
      );
      ctx.self.onmessage({ data: { code, input } });
    } catch (e) {
      reject(e);
    }
  });
}
test("browser Python runtime executes inclusive stepped range", async () => {
  const r = await execute(
    "SET total TO 0\nFOR i FROM 1 TO 9 STEP 2 DO\nSET total TO total + i\nEND FOR\nOUTPUT total",
  );
  assert.equal(r.success, true, r.output);
  assert.equal(r.output.trim(), "25");
});
test("browser Python runtime supports typed input and runtime errors", async () => {
  const r = await execute("DECLARE n AS INTEGER\nINPUT n\nOUTPUT n * 2", ["7"]);
  assert.equal(r.success, true, r.output);
  assert.equal(r.output.trim(), "14");
  const bad = await execute("OUTPUT 1 / 0");
  assert.equal(bad.success, false);
  assert.match(bad.output, /ZeroDivisionError/);
});
test("grammar rejects unrestricted runtime access", () => {
  for (const source of [
    'OUTPUT __import__("os")',
    'OUTPUT eval("1")',
    'CALL exec("pass")',
    "OUTPUT x.__class__",
  ])
    assert.equal(
      new PseudocodeCompiler().compile("BEGIN\n" + source + "\nEND").valid,
      false,
      source,
    );
});

"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { blankState, service } = require("../server/academic-service");
const { TABLES } = require("../server/store");
const { createApp } = require("../server/http");
const { passwordFields } = require("../server/auth");
const users = [
  {
    id: "i",
    username: "instructor",
    fullName: "Instructor",
    role: "instructor",
    status: "active",
  },
  {
    id: "j",
    username: "other",
    fullName: "Other Instructor",
    role: "instructor",
    status: "active",
  },
  {
    id: "s",
    username: "student",
    fullName: "Student",
    studentId: "2026-001",
    role: "student",
    status: "active",
  },
  {
    id: "t",
    username: "unrelated",
    fullName: "Other Student",
    role: "student",
    status: "active",
  },
  {
    id: "a",
    username: "admin",
    fullName: "Admin",
    role: "admin",
    status: "active",
  },
];
const code =
  "BEGIN\nDECLARE total AS INTEGER\nSET total TO 0\nFOR i FROM 1 TO 9 STEP 2 DO\nSET total TO total + i\nEND FOR\nOUTPUT total\nEND";
function fixture() {
  let state = blankState();
  let time = new Date("2026-09-12T10:00:00Z");
  const run = (uid, action, input = {}, key = crypto.randomUUID()) => {
    const copy = structuredClone(state);
    const result = service(
      copy,
      users.find((u) => u.id === uid),
      users,
      () => time,
    )(action, input, key);
    state = copy;
    return result;
  };
  const c = run("i", "saveClass", {
    name: "Algorithms",
    section: "3A",
    subject: "Programming",
    period: "2026",
  });
  run("s", "joinClass", { code: c.joinCode });
  run("i", "enroll", { classId: c.id, studentId: "s" });
  const e = run("i", "saveExercise", {
    title: "Odd sum",
    objective: "Use an accumulator",
    description: "Sum odd values below ten.",
    expectedOutput: "25",
    referencePseudocode: code,
    rubric: [{ id: "logic", label: "Logic", max: 100 }],
    status: "published",
  });
  const a = run("i", "saveAssignment", {
    classId: c.id,
    exerciseId: e.id,
    status: "published",
    availableAt: "2026-09-12T09:00:00Z",
    dueAt: "2026-09-13T10:00:00Z",
    maxAttempts: 2,
    passingScore: 60,
    latePolicy: "block",
    translationPreview: false,
  });
  return {
    run,
    c,
    e,
    a,
    state: () => state,
    time: (t) => (time = new Date(t)),
  };
}
test("complete connected workflow preserves attempts and private feedback", () => {
  const f = fixture(),
    { run, a } = f;
  assert.equal(run("s", "assignments").total, 1);
  assert.equal(run("t", "assignments").total, 0);
  assert.throws(() => run("t", "assignment", { id: a.id }), /unavailable/);
  assert.throws(() => run("s", "exercise", { id: f.e.id }), /Instructor/);
  assert.equal(
    JSON.stringify(run("s", "assignment", { id: a.id })).includes(
      "referencePseudocode",
    ),
    false,
  );
  assert.equal(
    run("s", "validate", { assignmentId: a.id, pseudocode: code }).python,
    undefined,
  );
  assert.throws(
    () =>
      run("s", "validate", {
        assignmentId: a.id,
        pseudocode: code,
        preview: true,
      }),
    /disabled/,
  );
  const draft = run("s", "saveDraft", {
    assignmentId: a.id,
    pseudocodeAnswer: code,
    revision: 0,
  });
  assert.equal(draft.revision, 1);
  assert.throws(
    () =>
      run("s", "saveDraft", {
        assignmentId: a.id,
        pseudocodeAnswer: code,
        revision: 0,
      }),
    /another tab/,
  );
  const key = crypto.randomUUID(),
    attempt = run(
      "s",
      "submit",
      { assignmentId: a.id, pseudocodeAnswer: code },
      key,
    );
  assert.equal(attempt.generatedPython, undefined);
  assert.equal(
    run("s", "submit", { assignmentId: a.id, pseudocodeAnswer: code }, key).id,
    attempt.id,
  );
  assert.equal(run("i", "submissions").total, 1);
  assert.throws(
    () =>
      run("s", "saveDraft", {
        assignmentId: a.id,
        pseudocodeAnswer: "",
        revision: 1,
      }),
    /read-only/,
  );
  assert.throws(() => run("j", "submission", { id: attempt.id }), /denied/);
  assert.throws(() => run("t", "submission", { id: attempt.id }), /denied/);
  run("i", "review", {
    attemptId: attempt.id,
    breakdown: { logic: 75 },
    feedback: "Private note",
    release: false,
  });
  assert.equal(run("s", "feedback").length, 0);
  assert.equal(
    JSON.stringify(run("s", "submission", { id: attempt.id })).includes(
      "Private note",
    ),
    false,
  );
  assert.throws(
    () =>
      run("i", "review", {
        attemptId: attempt.id,
        breakdown: { logic: 101 },
        release: true,
      }),
    /integer/,
  );
  const r = run("i", "review", {
    attemptId: attempt.id,
    breakdown: { logic: 75 },
    feedback: "Improve the loop explanation.",
    decision: "revision_required",
    release: true,
  });
  assert.equal(
    run("s", "submission", { id: attempt.id }).status,
    "revision_required",
  );
  assert.equal(run("s", "feedback")[0].score, 75);
  run("s", "viewed", { id: r.id });
  assert.ok(run("i", "feedback").find((x) => x.id === r.id).viewedAt);
  const before = structuredClone(f.state().attempts[0]);
  const second = run("s", "submit", {
    assignmentId: a.id,
    pseudocodeAnswer: code + "\n// Revision",
  });
  assert.equal(second.attemptNumber, 2);
  assert.deepEqual(f.state().attempts[0], before);
  const metrics = run("i", "analytics");
  assert.equal(metrics.submittedAttempts, 2);
  assert.deepEqual(metrics.completion, { numerator: 1, denominator: 1 });
  assert.equal(metrics.uniqueSubmitted, 1);
  assert.throws(
    () => run("s", "submit", { assignmentId: a.id, pseudocodeAnswer: code }),
    /Maximum/,
  );
  run("i", "reopen", { id: second.id });
  assert.equal(
    run("s", "submit", { assignmentId: a.id, pseudocodeAnswer: code })
      .attemptNumber,
    3,
  );
  assert.equal(
    run("s", "submit", { assignmentId: a.id, pseudocodeAnswer: code }, key).id,
    attempt.id,
  );
});
test("validation, deadlines, archive, removal, and ownership policies", () => {
  const { run, a, c, e, time } = fixture();
  assert.throws(
    () => run("s", "submit", { assignmentId: a.id, pseudocodeAnswer: "" }),
    /required/,
  );
  assert.throws(
    () =>
      run("i", "saveExercise", {
        ...e,
        hints: "",
        referencePseudocode: "IF broken",
        status: "published",
      }),
    /validation/,
  );
  assert.throws(() => run("j", "saveAssignment", { ...a }), /denied/);
  time("2026-09-14T00:00:00Z");
  assert.throws(
    () => run("s", "submit", { assignmentId: a.id, pseudocodeAnswer: code }),
    /Late/,
  );
  run("i", "saveAssignment", { ...a, latePolicy: "allow" });
  const attempt = run("s", "submit", {
    assignmentId: a.id,
    pseudocodeAnswer: code,
  });
  assert.equal(attempt.late, true);
  assert.throws(
    () => run("i", "saveAssignment", { ...a, dueAt: "2026-10-01T00:00:00Z" }),
    /Confirm/,
  );
  run("i", "saveAssignment", {
    ...a,
    dueAt: "2026-10-01T00:00:00Z",
    confirmChange: true,
  });
  assert.equal(
    run("s", "submission", { id: attempt.id }).assignmentSnapshot.dueAt,
    a.dueAt,
  );
  run("i", "enroll", { classId: c.id, studentId: "s", status: "removed" });
  assert.equal(run("s", "assignments").total, 0);
  assert.equal(run("s", "submission", { id: attempt.id }).id, attempt.id);
  run("i", "enroll", { classId: c.id, studentId: "s" });
  run("i", "saveClass", { ...c, status: "archived" });
  assert.equal(run("s", "assignment", { id: a.id }).canEdit, false);
  assert.throws(
    () =>
      run("i", "review", { attemptId: attempt.id, breakdown: { logic: 5 } }),
    /archived/,
  );
});
test("translator records and request keys cannot become coursework", () => {
  const { run, a } = fixture();
  run("s", "saveTranslationDraft", { pseudocode: code, revision: 0 });
  run("s", "saveTranslation", { pseudocode: code });
  assert.equal(run("s", "submissions").total, 0);
  assert.equal(run("s", "draft", { assignmentId: a.id }).pseudocodeAnswer, "");
  assert.equal(run("t", "translations").total, 0);
  const k = crypto.randomUUID();
  run("s", "validate", { pseudocode: code }, k);
  assert.throws(
    () => run("s", "validate", { pseudocode: "OUTPUT 1" }, k),
    /different content/,
  );
  assert.throws(() => run("s", "toString"), /Unknown/);
});
test("scheduled publication and date filter include entire final day", () => {
  const { run, a, time } = fixture();
  run("i", "saveAssignment", {
    ...a,
    status: "scheduled",
    availableAt: "2026-09-12T12:00:00Z",
  });
  assert.equal(run("s", "assignments").total, 0);
  time("2026-09-12T13:00:00Z");
  assert.equal(run("s", "assignments").total, 1);
  run("s", "submit", { assignmentId: a.id, pseudocodeAnswer: code });
  assert.equal(
    run("i", "submissions", { from: "2026-09-12", to: "2026-09-12" }).total,
    1,
  );
  assert.equal(
    run("i", "analytics", { from: "2026-09-12", to: "2026-09-12" })
      .submittedAttempts,
    1,
  );
});
function memoryStore(initial = {}) {
  let state = {
      ...Object.fromEntries(Object.keys(TABLES).map((k) => [k, []])),
      ...structuredClone(initial),
    },
    queue = Promise.resolve();
  return {
    transact(fn) {
      const result = queue.then(async () => {
        const copy = structuredClone(state);
        const result = await fn(copy);
        state = copy;
        return structuredClone(result);
      });
      queue = result.catch(() => {});
      return result;
    },
    state: () => state,
  };
}
test("HTTP sessions, credential upgrade, device approval, protected assets and concurrent retries", async (t) => {
  const credentials = await passwordFields("testing-password");
  const store = memoryStore({
    users: users.map((u) => ({ ...u, ...credentials })),
  });
  const app = createApp(store, { secureCookies: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const root = "http://127.0.0.1:" + server.address().port;
  async function http(path, body, cookie = "", extra = {}) {
    const r = await fetch(root + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PseudoPy-Client": "1",
        Cookie: cookie,
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const ct = r.headers.get("content-type") || "";
    return {
      status: r.status,
      body: ct.includes("json") ? await r.json() : await r.text(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  assert.equal((await http("/api/academic/classes", {})).status, 401);
  const login = await http("/api/auth/login", {
    username: "student",
    password: "testing-password",
  });
  assert.equal(login.status, 200);
  assert.equal(JSON.stringify(login.body).includes("passwordHash"), false);
  assert.equal(
    (await http("/api/auth/session", undefined, login.cookie)).body.id,
    "s",
  );
  assert.equal(
    (await http("/api/account/users", {}, login.cookie)).status,
    403,
  );
  assert.equal((await http("/server/auth.js")).status, 404);
  assert.equal((await http("/database.js")).status, 404);
  assert.equal((await http("/api/pseudopy_users")).status, 404);
  assert.equal(
    (
      await http("/api/academic/classes", {}, login.cookie, {
        Origin: "https://evil.test",
      })
    ).status,
    403,
  );
  const k = crypto.randomUUID();
  const responses = await Promise.all(
    [1, 2].map(() =>
      http(
        "/api/academic/saveTranslation",
        { pseudocode: code },
        login.cookie,
        { "Idempotency-Key": k },
      ),
    ),
  );
  assert.equal(responses[0].body.id, responses[1].body.id);
  assert.equal(store.state().translations.length, 1);
  const first = await http("/api/auth/login", {
    username: "instructor",
    password: "testing-password",
    deviceId: "device_first",
  });
  assert.equal(first.status, 200);
  assert.equal(
    (
      await http("/api/auth/login", {
        username: "instructor",
        password: "testing-password",
        deviceId: "device_second",
      })
    ).status,
    403,
  );
  const admin = await http("/api/auth/login", {
    username: "admin",
    password: "testing-password",
  });
  const pending = store
    .state()
    .devices.find((d) => d.deviceId === "device_second");
  await http(
    "/api/account/device",
    { id: pending.id, status: "approved" },
    admin.cookie,
  );
  assert.equal(
    (
      await http("/api/auth/login", {
        username: "instructor",
        password: "testing-password",
        deviceId: "device_second",
      })
    ).status,
    200,
  );
  await http("/api/auth/logout", {}, login.cookie);
  assert.equal(
    (await http("/api/auth/session", undefined, login.cookie)).status,
    401,
  );
});
module.exports = { memoryStore };
test("disabled hints stay hidden in submitted snapshots and draft exercises may be incomplete", () => {
  const { run, a, e } = fixture();
  const changed = run("i", "saveExercise", { ...e, hints: "Private clue" });
  run("i", "saveAssignment", { ...a, hintsEnabled: false });
  const attempt = run("s", "submit", {
    assignmentId: a.id,
    pseudocodeAnswer: code,
  });
  assert.deepEqual(attempt.assignmentSnapshot.hints, []);
  assert.deepEqual(
    run("i", "submission", { id: attempt.id }).assignmentSnapshot.hints,
    ["Private clue"],
  );
  const draft = run("i", "saveExercise", {
    title: "Work in progress",
    status: "draft",
  });
  assert.equal(draft.validation.valid, false);
  assert.throws(
    () =>
      run("i", "saveAssignment", {
        ...a,
        exerciseId: draft.id,
        confirmChange: true,
      }),
    /valid reference/,
  );
});
test("editing a legacy account retains its credential until successful upgrade", async () => {
  const store = memoryStore({
    users: [
      { ...users[4], password: "legacy-admin" },
      { ...users[2], password: "legacy-student" },
    ],
  });
  const { auth } = require("../server/auth");
  const a = auth(store);
  await a.account(users[4], "saveUser", {
    ...users[2],
    fullName: "Renamed Student",
    password: "",
  });
  assert.equal(
    store.state().users.find((u) => u.id === "s").password,
    "legacy-student",
  );
  const login = await a.login(
    { username: "student", password: "legacy-student" },
    "test-ip",
  );
  assert.equal(login.user.fullName, "Renamed Student");
  const saved = store.state().users.find((u) => u.id === "s");
  assert.equal(saved.password, undefined);
  assert.equal(saved.passwordAlgorithm, "scrypt");
  assert.equal((await a.session(login.token)).id, "s");
});

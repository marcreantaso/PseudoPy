// Isolated UI fixture server; never imported by the production server or build.
// HTTP authentication is tested separately in academic.test.js.
if (process.env.NODE_ENV !== "test")
  throw Error("UI fixtures require NODE_ENV=test");
const express = require("express"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { blankState, service } = require("../../server/academic-service");
const users = ["student", "instructor", "admin"].map((role) => ({
  id: "fixture_" + role,
  username: role,
  fullName: "QA " + role,
  role,
  status: "active",
  timezone: "UTC",
}));
let state = blankState();
const actor = (role) => users.find((u) => u.role === role) || users[0];
function call(role, action, input = {}, key = crypto.randomUUID()) {
  const next = structuredClone(state);
  const result = service(next, actor(role), users)(action, input, key);
  state = next;
  return result;
}
const c = call("instructor", "saveClass", {
  name: "QA Programming",
  section: "3A",
  subject: "Algorithms",
  period: "2026",
});
call("instructor", "enroll", { classId: c.id, studentId: "fixture_student" });
const e = call("instructor", "saveExercise", {
  title: "Sum odd values",
  objective: "Practice accumulation",
  description: "Sum odd integers from 1 through 9.",
  expectedOutput: "25",
  referencePseudocode: "BEGIN\nOUTPUT 25\nEND",
  rubric: [{ id: "logic", label: "Logic", max: 100 }],
  status: "published",
});
call("instructor", "saveAssignment", {
  classId: c.id,
  exerciseId: e.id,
  status: "published",
  availableAt: new Date(Date.now() - 3600000).toISOString(),
  dueAt: new Date(Date.now() + 86400000).toISOString(),
  maxAttempts: 2,
  passingScore: 60,
  translationPreview: false,
});
const app = express();
app.use(express.json());
const role = (req) => {
  try {
    return new URL(req.headers.referer).pathname.split("/")[1];
  } catch {
    return "student";
  }
};
app.get("/api/auth/session", (req, res) => res.json(actor(role(req))));
app.post("/api/academic/:action", (req, res) => {
  try {
    res.json(
      call(role(req), req.params.action, req.body, req.get("Idempotency-Key")),
    );
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});
app.post("/api/account/:action", (req, res) =>
  res.json(req.params.action === "users" ? users : []),
);
const root = path.resolve(__dirname, "../..");
app.use(express.static(path.join(root, "public")));
app.get("*", (req, res) => res.sendFile(path.join(root, "public/index.html")));
app.listen(4173, "0.0.0.0", () =>
  console.log("Isolated UI fixture ready on 4173; no Firebase connection."),
);

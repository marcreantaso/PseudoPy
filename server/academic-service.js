"use strict";
const crypto = require("node:crypto");
const { PseudocodeCompiler } = require("../compiler");
const compiler = new PseudocodeCompiler();
const COLLECTIONS = [
  "classes",
  "enrollments",
  "exercises",
  "assignments",
  "drafts",
  "attempts",
  "reviews",
  "translations",
  "translationDrafts",
  "executions",
  "notifications",
  "requests",
  "permissions",
  "diagnostics",
];
class DomainError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new DomainError(status, message);
};
const check = (condition, message, status = 400) => {
  if (!condition) fail(status, message);
};
const copy = (value) => structuredClone(value);
const text = (value, limit = 10000) =>
  String(value ?? "")
    .trim()
    .slice(0, limit);
const id = () => crypto.randomUUID();
const present = (value, label) => {
  check(text(value), label + " is required.");
  return text(value);
};
const integer = (value, min, max, label) => {
  value = Number(value);
  check(
    Number.isInteger(value) && value >= min && value <= max,
    `${label} must be an integer from ${min} to ${max}.`,
  );
  return value;
};
const instant = (value, label) => {
  const time = Date.parse(value);
  check(Number.isFinite(time), label + " must be a valid date and time.");
  return new Date(time).toISOString();
};
const publicUser = (u) => ({
  id: u.id || u._docId,
  fullName: u.fullName,
  studentId: u.studentId || "",
  username: u.username,
  role: u.role,
  status: u.status,
  instructorId: u.instructorId || null,
});
const category = (e) =>
  /block|END|THEN|DO\b/.test(e.message)
    ? "Block structure"
    : /character|string literal/.test(e.message)
      ? "Lexical"
      : /type|INTEGER|FLOAT|BOOLEAN/.test(e.message)
        ? "Type"
        : "Syntax";
const diagnostic = (result) => ({
  valid: result.valid,
  errors: result.errors.map((e) => ({ ...e, category: category(e) })),
  warnings: result.warnings.map((w) => ({ ...w, category: "Semantic" })),
  metrics: result.metrics,
});
const compile = (source) => {
  check(typeof source === "string" && source.trim(), "Pseudocode is required.");
  check(source.length <= 30000, "Pseudocode exceeds 30,000 characters.");
  return compiler.compile(source);
};
function blankState() {
  return Object.fromEntries(COLLECTIONS.map((key) => [key, []]));
}
function paginate(items, input) {
  const size = integer(input.pageSize || 20, 1, 100, "Page size");
  const page = integer(input.page || 1, 1, 100000, "Page");
  return {
    items: items.slice((page - 1) * size, page * size),
    total: items.length,
    page,
    pageSize: size,
  };
}
function service(state, actor, users, clock = () => new Date()) {
  const now = () => clock().toISOString();
  const userId = actor.id || actor._docId;
  const instructor = () =>
    check(
      ["instructor", "admin"].includes(actor.role),
      "Instructor access required.",
      403,
    );
  const student = () =>
    check(actor.role === "student", "Student access required.", 403);
  const owned = (row) =>
    row && (actor.role === "admin" || row.instructorId === userId);
  const find = (collection, recordId) => {
    const row = state[collection].find((r) => r.id === recordId);
    check(row, "Record not found.", 404);
    return row;
  };
  const owner = (collection, recordId) => {
    instructor();
    const row = find(collection, recordId);
    check(owned(row), "Access denied.", 403);
    return row;
  };
  const activeClass = (recordId) => {
    const row = find("classes", recordId);
    check(row.status === "active", "This class is archived and read-only.");
    return row;
  };
  const enrolled = (classId, uid = userId) =>
    state.enrollments.some(
      (e) =>
        e.classId === classId && e.studentId === uid && e.status === "active",
    );
  const roster = (classId) =>
    state.enrollments.filter(
      (e) => e.classId === classId && e.status === "active",
    );
  const targeted = (a, uid) =>
    enrolled(a.classId, uid) &&
    (!a.studentIds.length || a.studentIds.includes(uid));
  const available = (a) =>
    ["published", "scheduled"].includes(a.status) &&
    a.availableAt <= now() &&
    find("classes", a.classId).status === "active";
  const readable = (a) => a.status !== "draft" && a.availableAt <= now();
  const assignment = (aid) => {
    const a = find("assignments", aid);
    if (actor.role === "student")
      check(targeted(a, userId) && readable(a), "Assignment unavailable.", 403);
    else check(owned(a), "Access denied.", 403);
    return a;
  };
  const notice = (recipientId, key, title, href, availableAt = now()) => {
    if (state.notifications.some((n) => n.id === key)) return;
    state.notifications.push({
      id: key,
      recipientId,
      title,
      href,
      availableAt,
      createdAt: now(),
      readAt: null,
    });
  };
  const notifyAssignment = (a, title, event) => {
    for (const e of roster(a.classId).filter((e) => targeted(a, e.studentId)))
      notice(
        e.studentId,
        `${event}_${a.id}_${a.version}_${e.studentId}`,
        title,
        "/student/tasks/" + a.id,
        a.availableAt,
      );
  };
  const publicExercise = (e) => ({
    title: e.title,
    objective: e.objective,
    description: e.description,
    difficulty: e.difficulty,
    instructions: e.instructions,
    requiredInput: e.requiredInput,
    expectedOutput: e.expectedOutput,
    constraints: e.constraints,
    constructs: e.constructs,
    sampleInput: e.sampleInput,
    sampleOutput: e.sampleOutput,
    hints: e.hints,
    rubric: e.rubric,
    maxScore: e.maxScore,
  });
  const privateReview = (attemptId) =>
    state.reviews
      .filter((r) => r.attemptId === attemptId)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          state.reviews.indexOf(b) - state.reviews.indexOf(a),
      );
  const releasedReviews = (attemptId) =>
    privateReview(attemptId).filter((r) => r.status !== "draft");
  const attemptStatus = (attempt) => {
    const review = releasedReviews(attempt.id)[0];
    return review?.decision === "revision_required"
      ? "revision_required"
      : review
        ? "reviewed"
        : privateReview(attempt.id).some((r) => r.status === "draft")
          ? "under_review"
          : "submitted";
  };
  const attemptView = (attempt) => ({
    ...copy(attempt),
    assignmentSnapshot: {
      ...copy(attempt.assignmentSnapshot),
      hints:
        actor.role === "student" && !attempt.assignmentSnapshot.hintsEnabled
          ? []
          : attempt.assignmentSnapshot.hints,
    },
    generatedPython:
      actor.role === "student" && !attempt.assignmentSnapshot.translationPreview
        ? undefined
        : attempt.generatedPython,
    status: attemptStatus(attempt),
    score: releasedReviews(attempt.id)[0]?.score,
    reviews:
      actor.role === "student"
        ? releasedReviews(attempt.id)
        : privateReview(attempt.id),
  });
  const publicAssignment = (a) => {
    const own = state.attempts
      .filter((s) => s.assignmentId === a.id && s.studentId === userId)
      .sort((a, b) => b.attemptNumber - a.attemptNumber);
    const draft = state.drafts.find(
      (d) => d.assignmentId === a.id && d.studentId === userId,
    );
    const previous = own[0],
      permission = state.permissions.find(
        (p) => p.assignmentId === a.id && p.studentId === userId,
      );
    const canEdit =
      available(a) &&
      (a.latePolicy === "allow" || a.dueAt >= now()) &&
      own.length < a.maxAttempts + (permission?.extraAttempts || 0) &&
      (!previous ||
        attemptStatus(previous) === "revision_required" ||
        permission?.afterAttempt === previous.id);
    return {
      ...copy(a),
      studentIds: actor.role === "student" ? undefined : a.studentIds,
      canEdit,
      snapshot: {
        ...a.snapshot,
        hints: a.hintsEnabled ? a.snapshot.hints : [],
      },
      attempts: own.length,
      latest: own[0]
        ? {
            id: own[0].id,
            status: attemptStatus(own[0]),
            score: releasedReviews(own[0].id)[0]?.score,
          }
        : null,
      taskStatus: own[0]
        ? attemptStatus(own[0])
        : draft
          ? "in_progress"
          : "not_started",
      overdue: a.dueAt < now(),
    };
  };
  const ownAttempt = (attemptId) => {
    const attempt = find("attempts", attemptId);
    check(
      actor.role === "student" ? attempt.studentId === userId : owned(attempt),
      "Access denied.",
      403,
    );
    return attempt;
  };
  function exerciseFields(input, old = {}) {
    const published = input.status === "published";
    const required = (v, label) => (published ? present(v, label) : text(v));
    check(
      typeof (input.referencePseudocode || "") === "string" &&
        (input.referencePseudocode || "").length <= 30000,
      "Reference exceeds the size limit.",
    );
    const rubric = (input.rubric || []).map((r, i) => ({
      id: r.id || "criterion_" + i,
      label: present(r.label, "Criterion label"),
      max: integer(r.max, 1, 1000, "Criterion maximum"),
    }));
    const maxScore = rubric.reduce((total, r) => total + r.max, 0);
    check(
      (!published || rubric.length) &&
        maxScore <= 1000 &&
        new Set(rubric.map((r) => r.id)).size === rubric.length,
      "Provide a rubric totaling 1–1000 points with unique criteria.",
    );
    const result = compiler.compile(input.referencePseudocode || "");
    const status =
      input.status === "published"
        ? "published"
        : input.status === "archived"
          ? "archived"
          : "draft";
    if (status === "published")
      check(
        result.valid,
        "The reference pseudocode must pass validation before publication.",
      );
    const difficulty = input.difficulty || "moderate";
    check(
      ["easy", "moderate", "hard"].includes(difficulty),
      "Invalid difficulty.",
    );
    return {
      ...old,
      title: present(input.title, "Title"),
      objective: required(input.objective, "Learning objective"),
      description: required(input.description, "Problem description"),
      difficulty,
      instructions: text(input.instructions),
      requiredInput: text(input.requiredInput),
      expectedOutput: required(input.expectedOutput, "Expected output"),
      constraints: text(input.constraints),
      constructs: text(input.constructs),
      sampleInput: text(input.sampleInput),
      sampleOutput: text(input.sampleOutput),
      hints: text(input.hints).split("\n").filter(Boolean),
      tags: text(input.tags),
      referencePseudocode: input.referencePseudocode || "",
      expectedPython: result.python,
      validation: diagnostic(result),
      rubric,
      maxScore,
      status,
      updatedAt: now(),
    };
  }
  const actions = {
    bootstrap() {
      return {
        user: publicUser(actor),
        now: now(),
        ruleVersion: "pseudopy-grammar-2",
        classes: state.classes.filter((c) =>
          actor.role === "student"
            ? state.enrollments.some(
                (e) =>
                  e.classId === c.id &&
                  e.studentId === userId &&
                  e.status !== "removed",
              )
            : owned(c),
        ),
      };
    },
    classes() {
      return state.classes
        .filter((c) =>
          actor.role === "student"
            ? state.enrollments.some(
                (e) =>
                  e.classId === c.id &&
                  e.studentId === userId &&
                  e.status !== "removed",
              )
            : owned(c),
        )
        .map((c) => ({
          ...c,
          enrollment: state.enrollments.find(
            (e) => e.classId === c.id && e.studentId === userId,
          )?.status,
          enrolled: roster(c.id).length,
        }));
    },
    saveClass(input) {
      instructor();
      const old = input.id ? owner("classes", input.id) : null;
      const status = input.status === "archived" ? "archived" : "active";
      let joinCode = old?.joinCode;
      if (!joinCode)
        do {
          joinCode = crypto.randomBytes(5).toString("hex").toUpperCase();
        } while (state.classes.some((c) => c.joinCode === joinCode));
      const record = {
        ...old,
        id: old?.id || id(),
        instructorId: old?.instructorId || userId,
        name: present(input.name, "Class name"),
        section: present(input.section, "Section"),
        subject: present(input.subject, "Subject"),
        period: present(input.period, "Academic period"),
        joinCode,
        status,
        createdAt: old?.createdAt || now(),
        updatedAt: now(),
      };
      if (old) Object.assign(old, record);
      else state.classes.push(record);
      return record;
    },
    classDetail(input) {
      const c = find("classes", input.id);
      check(
        actor.role === "student" ? enrolled(c.id) : owned(c),
        "Access denied.",
        403,
      );
      return {
        ...c,
        enrollments:
          actor.role === "student"
            ? []
            : state.enrollments
                .filter((e) => e.classId === c.id)
                .map((e) => ({
                  ...e,
                  student: publicUser(
                    users.find((u) => (u.id || u._docId) === e.studentId) || {
                      id: e.studentId,
                    },
                  ),
                })),
      };
    },
    joinClass(input) {
      student();
      const c = state.classes.find(
        (c) =>
          c.joinCode === text(input.code).toUpperCase() &&
          c.status === "active",
      );
      check(c, "Invalid class code.", 404);
      let e = state.enrollments.find(
        (e) => e.classId === c.id && e.studentId === userId,
      );
      if (!e) {
        e = {
          id: id(),
          classId: c.id,
          instructorId: c.instructorId,
          studentId: userId,
          status: "pending",
          joinedAt: now(),
        };
        state.enrollments.push(e);
      } else if (e.status === "removed") {
        e.status = "pending";
        e.joinedAt = now();
      }
      notice(
        c.instructorId,
        "join_" + e.id + "_" + e.joinedAt,
        actor.fullName + " requested to join " + c.name,
        "/instructor/classes/" + c.id,
      );
      return e;
    },
    enroll(input) {
      const c = owner("classes", input.classId);
      activeClass(c.id);
      const target = users.find(
        (u) =>
          (u.id || u._docId) === input.studentId ||
          u.studentId === input.studentId,
      );
      check(
        target && target.role === "student" && target.status === "active",
        "Choose an active student account.",
      );
      const uid = target.id || target._docId;
      let e = state.enrollments.find(
        (e) => e.classId === c.id && e.studentId === uid,
      );
      const status = input.status === "removed" ? "removed" : "active";
      if (!e) {
        e = {
          id: id(),
          classId: c.id,
          instructorId: c.instructorId,
          studentId: uid,
          joinedAt: now(),
        };
        state.enrollments.push(e);
      }
      e.status = status;
      e.updatedAt = now();
      if (status === "active")
        for (const a of state.assignments.filter(
          (a) => a.classId === c.id && available(a) && targeted(a, uid),
        ))
          notice(
            uid,
            "enrolled_" + a.id + "_" + uid,
            "Assignment available: " + a.snapshot.title,
            "/student/tasks/" + a.id,
          );
      return e;
    },
    students(input) {
      instructor();
      const classIds = new Set(state.classes.filter(owned).map((c) => c.id));
      const ids = new Set(
        state.enrollments
          .filter((e) => classIds.has(e.classId) && e.status === "active")
          .map((e) => e.studentId),
      );
      return users
        .filter(
          (u) =>
            u.role === "student" &&
            (ids.has(u.id || u._docId) ||
              u.instructorId === userId ||
              actor.role === "admin"),
        )
        .map(publicUser);
    },
    exercises(input) {
      instructor();
      return paginate(
        state.exercises
          .filter(owned)
          .filter((e) => !input.status || e.status === input.status)
          .filter(
            (e) =>
              !input.search ||
              (e.title + " " + e.tags)
                .toLowerCase()
                .includes(input.search.toLowerCase()),
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        input,
      );
    },
    exercise(input) {
      return owner("exercises", input.id);
    },
    saveExercise(input) {
      instructor();
      const old = input.id ? owner("exercises", input.id) : null;
      const record = {
        ...exerciseFields(input, old || {}),
        id: old?.id || id(),
        instructorId: old?.instructorId || userId,
        createdAt: old?.createdAt || now(),
      };
      if (old) Object.assign(old, record);
      else state.exercises.push(record);
      return record;
    },
    duplicateExercise(input) {
      const e = copy(owner("exercises", input.id));
      e.id = id();
      e.instructorId = userId;
      e.title += " (copy)";
      e.status = "draft";
      e.createdAt = now();
      e.updatedAt = now();
      state.exercises.push(e);
      return e;
    },
    assignments(input) {
      const rows = state.assignments
        .filter((a) =>
          actor.role === "student"
            ? targeted(a, userId) && readable(a)
            : owned(a),
        )
        .map(publicAssignment)
        .filter(
          (a) =>
            (!input.classId || a.classId === input.classId) &&
            (!input.search ||
              a.snapshot.title
                .toLowerCase()
                .includes(input.search.toLowerCase())) &&
            (!input.status ||
              (input.status === "overdue"
                ? a.overdue
                : a.taskStatus === input.status || a.status === input.status)),
        );
      return paginate(
        rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
        input,
      );
    },
    assignment(input) {
      return publicAssignment(assignment(input.id));
    },
    saveAssignment(input) {
      instructor();
      const old = input.id ? owner("assignments", input.id) : null;
      const c = owner("classes", input.classId);
      activeClass(c.id);
      const e = owner("exercises", input.exerciseId);
      check(
        e.instructorId === c.instructorId,
        "Exercise and class must have the same instructor.",
      );
      const status = input.status || "draft";
      check(
        ["draft", "scheduled", "published", "closed", "archived"].includes(
          status,
        ),
        "Invalid assignment state.",
      );
      check(
        status === "draft" ||
          (e.status !== "archived" &&
            e.objective &&
            e.description &&
            e.expectedOutput &&
            e.rubric.length &&
            e.maxScore > 0 &&
            compile(e.referencePseudocode).valid),
        "A valid reference answer is required.",
      );
      const availableAt = instant(input.availableAt, "Availability"),
        dueAt = instant(input.dueAt, "Deadline");
      check(dueAt > availableAt, "Deadline must follow availability.");
      const studentIds = [...new Set(input.studentIds || [])];
      check(
        studentIds.every((uid) => enrolled(c.id, uid)),
        "Every selected student must be enrolled.",
      );
      if (old && state.attempts.some((a) => a.assignmentId === old.id)) {
        check(
          input.confirmChange === true,
          "Confirm changes affecting existing submissions.",
        );
        check(
          old.classId === c.id && old.exerciseId === e.id,
          "Submitted assignments cannot change class or exercise.",
        );
      }
      check(
        !input.executionPreview || input.translationPreview,
        "Execution preview requires translation preview.",
      );
      const record = {
        id: old?.id || id(),
        instructorId: c.instructorId,
        classId: c.id,
        exerciseId: e.id,
        studentIds,
        availableAt,
        dueAt,
        maxAttempts: integer(input.maxAttempts, 1, 20, "Maximum attempts"),
        latePolicy: input.latePolicy === "allow" ? "allow" : "block",
        passingScore: integer(
          input.passingScore,
          0,
          e.maxScore,
          "Passing score",
        ),
        hintsEnabled: !!input.hintsEnabled,
        translationPreview: !!input.translationPreview,
        executionPreview: !!input.executionPreview,
        feedbackPolicy: "manual_release",
        instructions: text(input.instructions),
        status,
        snapshot: publicExercise(e),
        version: (old?.version || 0) + 1,
        createdAt: old?.createdAt || now(),
        updatedAt: now(),
      };
      if (old) Object.assign(old, record);
      else state.assignments.push(record);
      if (status !== "draft")
        notifyAssignment(
          record,
          (old ? "Assignment updated: " : "New assignment: ") + e.title,
          old ? "updated" : "published",
        );
      return record;
    },
    taskDrafts() {
      student();
      return state.drafts
        .filter((d) => d.studentId === userId)
        .filter((d) => {
          const a = state.assignments.find((a) => a.id === d.assignmentId);
          return (
            a &&
            targeted(a, userId) &&
            readable(a) &&
            publicAssignment(a).canEdit
          );
        })
        .map((d) => ({
          id: d.id,
          assignmentId: d.assignmentId,
          title: find("assignments", d.assignmentId).snapshot.title,
          updatedAt: d.updatedAt,
          status: "draft",
        }));
    },
    inspect(input) {
      instructor();
      const r = compile(input.pseudocode);
      return {
        validation: diagnostic(r),
        ast: r.ast,
        tokens: r.tokens,
        python: r.python,
      };
    },
    draft(input) {
      student();
      const a = assignment(input.assignmentId);
      return (
        state.drafts.find(
          (d) => d.assignmentId === a.id && d.studentId === userId,
        ) || { assignmentId: a.id, pseudocodeAnswer: "", revision: 0 }
      );
    },
    saveDraft(input) {
      student();
      const a = assignment(input.assignmentId);
      activeClass(a.classId);
      check(
        publicAssignment(a).canEdit,
        "This task is read-only. Request a revision or reopening.",
      );
      check(
        String(input.pseudocodeAnswer || "").length <= 30000,
        "Answer exceeds the size limit.",
      );
      let d = state.drafts.find(
        (d) => d.assignmentId === a.id && d.studentId === userId,
      );
      if (d)
        check(
          input.revision === d.revision,
          "Draft changed in another tab. Reload before saving.",
          409,
        );
      else {
        d = {
          id: id(),
          assignmentId: a.id,
          studentId: userId,
          instructorId: a.instructorId,
          createdAt: now(),
          revision: 0,
        };
        state.drafts.push(d);
      }
      d.pseudocodeAnswer = String(input.pseudocodeAnswer || "");
      d.revision++;
      d.updatedAt = now();
      return d;
    },
    validate(input) {
      let a = null;
      if (input.assignmentId) {
        a = assignment(input.assignmentId);
        if (actor.role === "student" && input.preview)
          check(a.translationPreview, "Translation preview is disabled.", 403);
      }
      const result = compile(input.pseudocode);
      const report = diagnostic(result);
      state.diagnostics.push({
        id: id(),
        userId,
        instructorId:
          a?.instructorId ||
          (["instructor", "admin"].includes(actor.role) ? userId : null),
        assignmentId: a?.id || null,
        valid: result.valid,
        errors: report.errors.map((e) => ({ category: e.category })),
        duration: result.metrics.totalTime,
        createdAt: now(),
      });
      return {
        ...report,
        python:
          !a ||
          actor.role !== "student" ||
          (input.preview && a.translationPreview)
            ? result.python
            : undefined,
        ruleVersion: "pseudopy-grammar-2",
      };
    },
    submit(input) {
      student();
      const a = assignment(input.assignmentId);
      activeClass(a.classId);
      check(available(a), "This assignment is closed.");
      check(
        a.latePolicy === "allow" || a.dueAt >= now(),
        "Late submissions are closed.",
      );
      const previous = state.attempts
        .filter((s) => s.assignmentId === a.id && s.studentId === userId)
        .sort((a, b) => b.attemptNumber - a.attemptNumber);
      const permission = state.permissions.find(
        (p) => p.assignmentId === a.id && p.studentId === userId,
      );
      check(
        previous.length < a.maxAttempts + (permission?.extraAttempts || 0),
        "Maximum attempts reached.",
      );
      if (previous.length)
        check(
          attemptStatus(previous[0]) === "revision_required" ||
            permission?.afterAttempt === previous[0].id,
          "This submitted attempt is locked. Your instructor must return or reopen it.",
        );
      const result = compile(input.pseudocodeAnswer);
      check(result.valid, "Resolve validation errors before submitting.");
      const record = {
        id: id(),
        assignmentId: a.id,
        instructorId: a.instructorId,
        classId: a.classId,
        studentId: userId,
        studentName: actor.fullName,
        studentNumber: actor.studentId || "",
        attemptNumber: previous.length + 1,
        pseudocodeAnswer: input.pseudocodeAnswer,
        generatedPython: result.python,
        validation: diagnostic(result),
        assignmentSnapshot: {
          ...copy(a.snapshot),
          instructions: a.instructions,
          hintsEnabled: a.hintsEnabled,
          translationPreview: a.translationPreview,
          executionPreview: a.executionPreview,
          dueAt: a.dueAt,
          version: a.version,
        },
        late: a.dueAt < now(),
        submittedAt: now(),
      };
      state.attempts.push(record);
      notice(
        a.instructorId,
        "submitted_" + record.id,
        "Submission from " + actor.fullName,
        "/instructor/submissions/" + record.id,
      );
      return attemptView(record);
    },
    submissions(input) {
      const rows = state.attempts
        .filter((s) =>
          actor.role === "student" ? s.studentId === userId : owned(s),
        )
        .map(attemptView)
        .filter(
          (s) =>
            (!input.classId || s.classId === input.classId) &&
            (!input.assignmentId || s.assignmentId === input.assignmentId) &&
            (!input.status || s.status === input.status) &&
            (!input.late || s.late) &&
            (!input.from || s.submittedAt >= input.from) &&
            (!input.to ||
              s.submittedAt <=
                (input.to.length === 10
                  ? input.to + "T23:59:59.999Z"
                  : input.to)) &&
            (!input.search ||
              (
                s.studentName +
                " " +
                s.studentNumber +
                " " +
                s.assignmentSnapshot.title
              )
                .toLowerCase()
                .includes(input.search.toLowerCase())),
        );
      const sort = [
        "submittedAt",
        "studentName",
        "attemptNumber",
        "score",
      ].includes(input.sort)
        ? input.sort
        : "submittedAt";
      const dir = input.direction === "asc" ? 1 : -1;
      rows.sort((a, b) =>
        typeof a[sort] === "number"
          ? (a[sort] - b[sort]) * dir
          : String(a[sort] || "").localeCompare(String(b[sort] || "")) * dir,
      );
      return paginate(rows, input);
    },
    submission(input) {
      return attemptView(ownAttempt(input.id));
    },
    review(input) {
      instructor();
      const attempt = ownAttempt(input.attemptId);
      activeClass(attempt.classId);
      const rubric = attempt.assignmentSnapshot.rubric;
      const breakdown = rubric.map((c) => ({
        criterionId: c.id,
        score: integer(input.breakdown?.[c.id] ?? 0, 0, c.max, c.label),
      }));
      const score = breakdown.reduce((n, c) => n + c.score, 0);
      const decision =
        input.decision === "revision_required"
          ? "revision_required"
          : "reviewed";
      if (decision === "revision_required")
        present(input.feedback, "Revision feedback");
      const comments = (input.comments || []).map((c) => ({
        line: integer(
          c.line,
          1,
          attempt.pseudocodeAnswer.split("\n").length,
          "Comment line",
        ),
        text: present(c.text, "Comment"),
      }));
      const released = !!input.release;
      const record = {
        id: id(),
        attemptId: attempt.id,
        instructorId: attempt.instructorId,
        reviewerName: actor.fullName,
        studentId: attempt.studentId,
        score,
        breakdown,
        feedback: text(input.feedback),
        comments,
        decision,
        status: released ? "released" : "draft",
        createdAt: now(),
        releasedAt: released ? now() : null,
        viewedAt: null,
      };
      if (released)
        for (const prior of state.reviews.filter(
          (r) => r.attemptId === attempt.id && r.status === "released",
        ))
          prior.status = "superseded";
      state.reviews.push(record);
      if (released && decision === "revision_required") {
        const a = find("assignments", attempt.assignmentId),
          count = state.attempts.filter(
            (s) => s.assignmentId === a.id && s.studentId === attempt.studentId,
          ).length;
        let p = state.permissions.find(
          (p) => p.assignmentId === a.id && p.studentId === attempt.studentId,
        );
        if (count >= a.maxAttempts + (p?.extraAttempts || 0)) {
          if (!p) {
            p = {
              id: id(),
              assignmentId: a.id,
              studentId: attempt.studentId,
              instructorId: a.instructorId,
              extraAttempts: 0,
            };
            state.permissions.push(p);
          }
          p.extraAttempts++;
          p.afterAttempt = attempt.id;
          p.updatedAt = now();
        }
      }
      if (released)
        notice(
          attempt.studentId,
          "feedback_" + record.id,
          decision === "revision_required"
            ? "Revision required: " + attempt.assignmentSnapshot.title
            : "Feedback released: " + attempt.assignmentSnapshot.title,
          "/student/submissions/" + attempt.id,
        );
      return record;
    },
    reopen(input) {
      instructor();
      const attempt = ownAttempt(input.id);
      activeClass(attempt.classId);
      let p = state.permissions.find(
        (p) =>
          p.assignmentId === attempt.assignmentId &&
          p.studentId === attempt.studentId,
      );
      if (!p) {
        p = {
          id: id(),
          assignmentId: attempt.assignmentId,
          studentId: attempt.studentId,
          extraAttempts: 0,
          instructorId: attempt.instructorId,
        };
        state.permissions.push(p);
      }
      if (p.afterAttempt !== attempt.id) {
        p.afterAttempt = attempt.id;
        p.extraAttempts++;
        p.updatedAt = now();
      }
      notice(
        attempt.studentId,
        "reopened_" + attempt.id,
        "Attempt reopened: " + attempt.assignmentSnapshot.title,
        "/student/tasks/" + attempt.assignmentId,
      );
      return p;
    },
    feedback() {
      return state.reviews
        .filter((r) =>
          actor.role === "student"
            ? r.studentId === userId && r.status !== "draft"
            : owned(r),
        )
        .map((r) => ({
          ...r,
          task: find("attempts", r.attemptId).assignmentSnapshot.title,
          attemptNumber: find("attempts", r.attemptId).attemptNumber,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    viewed(input) {
      student();
      const r = find("reviews", input.id);
      check(
        r.studentId === userId && r.status !== "draft",
        "Access denied.",
        403,
      );
      r.viewedAt = r.viewedAt || now();
      return r;
    },
    translationDraft() {
      return (
        state.translationDrafts.find((d) => d.userId === userId) || {
          pseudocode: "",
          revision: 0,
        }
      );
    },
    saveTranslationDraft(input) {
      check(
        typeof input.pseudocode === "string" &&
          input.pseudocode.length <= 30000,
        "Draft exceeds the size limit.",
      );
      let d = state.translationDrafts.find((d) => d.userId === userId);
      if (d)
        check(
          d.revision === input.revision,
          "Translator draft changed in another tab. Reload before saving.",
          409,
        );
      else {
        d = { id: id(), userId, revision: 0 };
        state.translationDrafts.push(d);
      }
      d.pseudocode = input.pseudocode;
      d.revision++;
      d.updatedAt = now();
      return d;
    },
    logExecution(input) {
      if (input.assignmentId) {
        const a = assignment(input.assignmentId);
        check(
          actor.role !== "student" || a.executionPreview,
          "Execution preview is disabled.",
          403,
        );
      }
      const r = {
        id: id(),
        userId,
        instructorId:
          actor.role === "student"
            ? input.assignmentId
              ? assignment(input.assignmentId).instructorId
              : null
            : userId,
        assignmentId: input.assignmentId || null,
        success: input.success === true,
        duration: Math.max(0, Math.min(Number(input.duration) || 0, 30000)),
        source: "browser_runtime",
        createdAt: now(),
      };
      state.executions.push(r);
      return r;
    },
    saveTranslation(input) {
      const result = compile(input.pseudocode);
      check(result.valid, "Save a successful translation.");
      const r = {
        id: id(),
        userId,
        pseudocode: input.pseudocode,
        generatedPython: result.python,
        validation: diagnostic(result),
        createdAt: now(),
        updatedAt: now(),
      };
      state.translations.push(r);
      return r;
    },
    translations(input) {
      return paginate(
        state.translations
          .filter((t) => t.userId === userId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        input,
      );
    },
    notifications() {
      const upcoming = state.assignments
        .filter(
          (a) =>
            actor.role === "student" &&
            targeted(a, userId) &&
            available(a) &&
            a.dueAt > now() &&
            Date.parse(a.dueAt) - clock().getTime() < 86400000 &&
            !state.attempts.some(
              (s) => s.assignmentId === a.id && s.studentId === userId,
            ),
        )
        .map((a) => ({
          id: "due_" + a.id,
          title: "Deadline approaching: " + a.snapshot.title,
          href: "/student/tasks/" + a.id,
          createdAt: a.dueAt,
          readAt: null,
        }));
      return [
        ...upcoming,
        ...state.notifications.filter(
          (n) => n.recipientId === userId && n.availableAt <= now(),
        ),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    readNotification(input) {
      const n = find("notifications", input.id);
      check(n.recipientId === userId, "Access denied.", 403);
      n.readAt = now();
      return n;
    },
    announcement(input) {
      const c = owner("classes", input.classId);
      activeClass(c.id);
      const message = present(input.message, "Announcement");
      const event = id();
      for (const e of roster(c.id))
        notice(
          e.studentId,
          "announcement_" + event + "_" + e.studentId,
          c.name + ": " + message,
          "/student/tasks",
        );
      return { sent: roster(c.id).length };
    },
    diagnostics() {
      instructor();
      const rows = state.diagnostics.filter((d) => owned(d));
      const runs = state.executions.filter(owned);
      return {
        executions: runs.length,
        executionSuccesses: runs.filter((r) => r.success).length,
        failedProcessingJobs: rows.filter((r) => !r.valid).length,
        ruleVersion: "pseudopy-grammar-2",
        requests: rows.length,
        successes: rows.filter((d) => d.valid).length,
        averageDuration: rows.length
          ? rows.reduce((n, d) => n + d.duration, 0) / rows.length
          : null,
        errors: rows.reduce((all, d) => {
          for (const e of d.errors)
            all[e.category] = (all[e.category] || 0) + 1;
          return all;
        }, {}),
      };
    },
    analytics(input) {
      instructor();
      const assignments = state.assignments
        .filter(owned)
        .filter(
          (a) =>
            (!input.classId || a.classId === input.classId) &&
            (!input.assignmentId || a.id === input.assignmentId),
        );
      const ids = new Set(assignments.map((a) => a.id));

      // Compute from all scoped records, independently of the current table page.
      const rows = state.attempts.filter(
        (s) =>
          owned(s) &&
          ids.has(s.assignmentId) &&
          (!input.from || s.submittedAt >= input.from) &&
          (!input.to ||
            s.submittedAt <=
              (input.to.length === 10
                ? input.to + "T23:59:59.999Z"
                : input.to)) &&
          (!input.status || attemptStatus(s) === input.status) &&
          (!input.late || s.late) &&
          (!input.search ||
            (
              s.studentName +
              " " +
              s.studentNumber +
              " " +
              s.assignmentSnapshot.title
            )
              .toLowerCase()
              .includes(input.search.toLowerCase())),
      );
      const students = new Set(
        assignments.flatMap((a) =>
          roster(a.classId)
            .filter((e) => targeted(a, e.studentId))
            .map((e) => e.studentId),
        ),
      );
      const pairs = new Set(
        assignments.flatMap((a) =>
          roster(a.classId)
            .filter((e) => targeted(a, e.studentId))
            .map((e) => a.id + "|" + e.studentId),
        ),
      );
      const completed = new Set(
        rows
          .map((s) => s.assignmentId + "|" + s.studentId)
          .filter((p) => pairs.has(p)),
      );
      const submitted = new Set(rows.map((s) => s.studentId));
      const started = new Set(
        state.drafts
          .filter(
            (d) =>
              ids.has(d.assignmentId) &&
              (!input.from || d.updatedAt >= input.from) &&
              (!input.to ||
                d.updatedAt <=
                  (input.to.length === 10
                    ? input.to + "T23:59:59.999Z"
                    : input.to)) &&
              (!input.status ||
                rows.some(
                  (s) =>
                    s.studentId === d.studentId &&
                    s.assignmentId === d.assignmentId,
                )) &&
              (!input.search ||
                rows.some(
                  (s) =>
                    s.studentId === d.studentId &&
                    s.assignmentId === d.assignmentId,
                )),
          )
          .map((d) => d.studentId),
      );
      const scores = rows
        .map((s) => releasedReviews(s.id)[0]?.score)
        .filter((s) => Number.isFinite(s));
      const activity = {};
      for (const s of rows) {
        const day = s.submittedAt.slice(0, 10);
        activity[day] = (activity[day] || 0) + 1;
      }
      const diagnostics = state.diagnostics.filter(
        (d) =>
          owned(d) &&
          ids.has(d.assignmentId) &&
          (!input.from || d.createdAt >= input.from) &&
          (!input.to ||
            d.createdAt <=
              (input.to.length === 10
                ? input.to + "T23:59:59.999Z"
                : input.to)) &&
          (!(input.status || input.search || input.late) ||
            rows.some(
              (s) =>
                s.studentId === d.userId && s.assignmentId === d.assignmentId,
            )),
      );
      const errors = {};
      for (const d of diagnostics)
        for (const e of d.errors)
          errors[e.category] = (errors[e.category] || 0) + 1;
      return {
        enrolled: students.size,
        started: started.size,
        submittedAttempts: rows.length,
        uniqueSubmitted: submitted.size,
        pendingReviews: rows.filter((s) => !releasedReviews(s.id).length)
          .length,
        averageScore: scores.length
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null,
        completion: { numerator: completed.size, denominator: pairs.size },
        activity: Object.entries(activity)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count })),
        errors,
        lastUpdated: now(),
        activeClasses: state.classes.filter(
          (c) => owned(c) && c.status === "active",
        ).length,
        publishedAssignments: assignments.filter(available).length,
        overdue: assignments
          .filter((a) => a.dueAt < now())
          .reduce(
            (total, a) =>
              total +
              roster(a.classId).filter(
                (e) =>
                  targeted(a, e.studentId) &&
                  !state.attempts.some(
                    (s) =>
                      s.assignmentId === a.id && s.studentId === e.studentId,
                  ),
              ).length,
            0,
          ),
      };
    },
  };
  const mutations = new Set([
    "saveClass",
    "joinClass",
    "enroll",
    "saveExercise",
    "duplicateExercise",
    "saveAssignment",
    "saveDraft",
    "validate",
    "submit",
    "review",
    "reopen",
    "viewed",
    "saveTranslation",
    "saveTranslationDraft",
    "logExecution",
    "readNotification",
    "announcement",
  ]);
  return function dispatch(action, input = {}, key) {
    check(
      actor.status === "active" &&
        ["student", "instructor", "admin"].includes(actor.role),
      "Account unavailable.",
      403,
    );
    check(
      Object.hasOwn(actions, action) && typeof actions[action] === "function",
      "Unknown academic action.",
      404,
    );
    if (mutations.has(action)) {
      check(
        typeof key === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(key),
        "An idempotency key is required.",
      );
      const rid = crypto
        .createHash("sha256")
        .update(userId + "|" + key)
        .digest("hex");
      const fingerprint = crypto
        .createHash("sha256")
        .update(JSON.stringify({ action, input }))
        .digest("hex");
      const prior = state.requests.find((r) => r.id === rid);
      if (prior) {
        check(
          prior.role === actor.role,
          "Account role changed; this request cannot be replayed.",
          403,
        );
        check(
          prior.fingerprint === fingerprint,
          "Request key was already used for different content.",
          409,
        );
        return copy(prior.result);
      }
      const result = actions[action](input);
      state.requests.push({
        id: rid,
        userId,
        role: actor.role,
        fingerprint,
        result: copy(result),
        createdAt: now(),
      });
      return copy(result);
    }
    return copy(actions[action](input));
  };
}
module.exports = {
  COLLECTIONS,
  DomainError,
  blankState,
  service,
  publicUser,
  diagnostic,
};

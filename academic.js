/* PseudoPy connected workflow module. No task state is shared with the translator. */
"use strict";
(() => {
  const $ = (s) => document.querySelector(s),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const html = String.raw;
  let user = null,
    pageVersion = 0,
    dirty = false,
    autosave = null,
    worker = null;
  let report = null,
    generated = "",
    sourceValidated = "",
    execution = null,
    task = null,
    draft = null,
    translatorDraft = null;
  const pending = new Map();
  const key = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
  const date = (v) =>
    v
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: user?.timezone || "UTC",
        }).format(new Date(v))
      : "—";
  const badge = (v) =>
    `<span class="badge">${esc(String(v || "").replaceAll("_", " "))}</span>`;
  const link = (route, label, cls = "") =>
    `<a class="${cls}" href="/${user.role}/${route}" data-route>${esc(label)}</a>`;
  function notify(message, error = false) {
    const el = $("#notice");
    if (el) {
      el.textContent = message;
      el.className = error ? "error" : "";
    }
  }
  async function request(path, body, mutation = false) {
    const fingerprint = JSON.stringify([path, body]);
    let rid = pending.get(fingerprint);
    if (mutation && !rid) {
      rid = key();
      pending.set(fingerprint, rid);
      try {
        sessionStorage.setItem(
          "pseudopy_pending",
          JSON.stringify([...pending]),
        );
      } catch {}
    }
    let response;
    try {
      response = await fetch("/api/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PseudoPy-Client": "1",
          ...(mutation ? { "Idempotency-Key": rid } : {}),
        },
        credentials: "same-origin",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw Error(
        "Offline or connection interrupted. Your answer is kept here. Retry when connected.",
      );
    }
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && user) {
        user = null;
        login();
      }
      if (response.status < 500) {
        pending.delete(fingerprint);
      }
      throw Error(result.error || "Request failed.");
    }
    if (mutation) {
      pending.delete(fingerprint);
      try {
        sessionStorage.setItem(
          "pseudopy_pending",
          JSON.stringify([...pending]),
        );
      } catch {}
    }
    return result;
  }
  const api = (action, input = {}, mutation = false) =>
    request("academic/" + action, input, mutation);
  const account = (action, input = {}) => request("account/" + action, input);
  async function busy(button, fn, label = "Working…") {
    if (button?.disabled) return;
    const old = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = label;
    }
    try {
      return await fn();
    } catch (e) {
      notify(e.message, true);
      const error = $("#form-error");
      if (error) error.textContent = e.message;
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = old;
      }
    }
  }
  function dialog(title, content, drawer = false) {
    $("#modal")?.remove();
    const d = document.createElement("dialog");
    d.id = "modal";
    if (drawer) d.className = "drawer";
    d.innerHTML = `<div class="row between"><h2>${esc(title)}</h2><button data-close aria-label="Close dialog">✕</button></div>${content}`;
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.addEventListener("close", () => d.remove());
    d.showModal();
    return d;
  }
  function confirmAction(title, message) {
    return new Promise((resolve) => {
      const d = dialog(
        title,
        `<p>${esc(message)}</p><div class="row"><button id="confirm-yes" class="primary">Confirm</button><button id="confirm-no">Cancel</button></div>`,
      );
      let answered = false;
      d.querySelector("#confirm-yes").onclick = () => {
        answered = true;
        resolve(true);
        d.close();
      };
      d.querySelector("#confirm-no").onclick = () => d.close();
      d.addEventListener("close", () => {
        if (!answered) resolve(false);
      });
    });
  }
  function field(name, label, value = "", type = "text", required = false) {
    return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
  }
  function area(name, label, value = "", rows = 4) {
    return `<label>${esc(label)}<textarea name="${name}" rows="${rows}">${esc(value)}</textarea></label>`;
  }
  function select(name, label, options, value = "") {
    return `<label>${esc(label)}<select name="${name}">${options
      .map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o.replaceAll("_", " ")];
        return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`;
      })
      .join("")}</select></label>`;
  }
  const checkbox = (name, label, value = false) =>
    `<label class="check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${esc(label)}</label>`;
  function values(form) {
    const v = Object.fromEntries(new FormData(form));
    form
      .querySelectorAll("[type=checkbox]")
      .forEach((c) => (v[c.name] = c.checked));
    return v;
  }
  function editor(id, title, value = "", readonly = false) {
    return `<section class="card"><div class="row between"><h2>${esc(title)}</h2>${badge((id === "python" ? "Python" : "Pseudocode") + (readonly ? " · read only" : ""))}</div><div class="code-wrap"><div class="line-numbers" aria-hidden="true"></div><textarea id="${id}" aria-label="${esc(title)}" spellcheck="false" maxlength="30000" ${readonly ? "readonly" : ""}>${esc(value)}</textarea></div></section>`;
  }
  function wireEditors() {
    document.querySelectorAll(".code-wrap textarea").forEach((el) => {
      const numbers = el.previousElementSibling;
      const update = () =>
        (numbers.textContent = Array.from(
          { length: el.value.split("\n").length },
          (_, i) => i + 1,
        ).join("\n"));
      update();
      if (el.dataset.wired) return;
      el.dataset.wired = "true";
      el.addEventListener("input", update);
      el.addEventListener("scroll", () => (numbers.scrollTop = el.scrollTop));
    });
  }
  function setCode(id, value) {
    const el = $(id);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event("input"));
    }
  }
  function codeFocus(line) {
    const el = $("#answer") || $("#source");
    if (!el) return;
    const lines = el.value.split("\n");
    const start =
      lines.slice(0, Math.max(0, line - 1)).join("\n").length +
      (line > 1 ? 1 : 0);
    el.focus();
    el.setSelectionRange(start, start + (lines[line - 1] || "").length);
    el.scrollTop = Math.max(0, line - 4) * 23;
  }
  const menus = {
    student: [
      ["dashboard", "⌂", "Dashboard"],
      ["translator", "⌘", "Pseudocode Translator"],
      ["tasks", "▤", "Exercises & Tasks"],
      ["submissions", "↥", "My Submissions"],
      ["feedback", "☷", "Feedback"],
      ["settings", "⚙", "Settings"],
    ],
    instructor: [
      ["dashboard", "⌂", "Dashboard"],
      ["classes", "▦", "Classes"],
      ["students", "♙", "Students"],
      ["exercises", "▤", "Exercise Library"],
      ["assignments", "▣", "Assignments"],
      ["submissions", "↥", "Submissions"],
      ["analytics", "▥", "Analytics"],
      ["translator", "⌘", "Translator"],
      ["compiler-diagnostics", "◇", "Compiler Diagnostics"],
      ["settings", "⚙", "Settings"],
    ],
    admin: [
      ["dashboard", "⌂", "Dashboard"],
      ["users", "♙", "Accounts"],
      ["devices", "▦", "Device Approvals"],
      ["audit", "☷", "Audit Log"],
      ["classes", "▦", "Classes"],
      ["assignments", "▣", "Assignments"],
      ["analytics", "▥", "Analytics"],
      ["translator", "⌘", "Translator"],
      ["compiler-diagnostics", "◇", "Compiler Diagnostics"],
      ["settings", "⚙", "Settings"],
    ],
  };
  function nav() {
    return menus[user.role]
      .map(
        ([r, i, l]) =>
          `<a href="/${user.role}/${r}" data-route title="${l}" ${location.pathname.split("/")[2] === r ? 'aria-current="page"' : ""}><span aria-hidden="true">${i}</span><span class="nav-label">${l}</span></a>`,
      )
      .join("");
  }
  function shell() {
    document.body.innerHTML = `<a href="#content" class="skip">Skip to content</a><div id="offline" class="offline" ${navigator.onLine ? "hidden" : ""}>Offline — saved drafts remain available. Reconnect before submitting.</div><div id="shell"><aside id="sidebar"><a class="brand" href="/${user.role}/dashboard" data-route>Pseudo<span>Py</span></a><nav id="nav" aria-label="Main navigation">${nav()}</nav><div class="profile"><strong>${esc(user.fullName)}</strong><br><small>${esc(user.role)}</small><p><button data-logout>Sign out</button></p></div></aside><div><header id="topbar" class="row between"><div class="row"><button id="menu" aria-label="Toggle navigation" aria-expanded="false">☰</button><strong id="crumb">PseudoPy</strong></div><div class="row"><button id="notifications">Notifications</button><button id="theme" aria-label="Toggle theme">◐</button></div></header><main id="content" tabindex="-1"></main></div></div><div id="notice" role="status" aria-live="polite"></div>`;
    const offlineLink = document.createElement("a");
    offlineLink.href = "/offline.html";
    offlineLink.textContent = "Offline Logic Lab";
    offlineLink.className = "button";
    $("#sidebar .profile").prepend(offlineLink);
    $("#menu").onclick = () => {
      if (matchMedia("(max-width:720px)").matches) {
        document.body.classList.remove("collapsed");
        const d = dialog(
          "Navigation",
          `<nav class="stack">${nav()}</nav><p>${esc(user.fullName)}</p><button data-logout>Sign out</button>`,
          true,
        );
        d.querySelector("nav").id = "nav";
      } else document.body.classList.toggle("collapsed");
      $("#menu").setAttribute(
        "aria-expanded",
        String(!document.body.classList.contains("collapsed")),
      );
    };
    $("#theme").onclick = () => {
      document.body.classList.toggle("light");
      localStorage.setItem(
        "pseudopy_theme",
        document.body.classList.contains("light") ? "light" : "dark",
      );
    };
    $("#notifications").onclick = (e) =>
      busy(e.currentTarget, showNotifications);
    if (localStorage.getItem("pseudopy_theme") === "light")
      document.body.classList.add("light");
  }
  function login() {
    document.body.innerHTML = `<main class="login card"><a class="brand">Pseudo<span>Py</span></a><h1>Welcome back</h1><p class="muted">Sign in to your learning workspace.</p><form id="login" class="stack">${field("username", "Username", "", "text", true)}${field("password", "Password", "", "password", true)}<p id="form-error" class="error" role="alert"></p><button class="primary">Sign in</button><small>Use your existing account. Contact your administrator for account or device approval.</small></form></main><div id="notice" role="status"></div>`;
    const offlineLink = document.createElement("a");
    offlineLink.href = "/offline.html";
    offlineLink.textContent = "Use the Offline Logic Lab without signing in";
    offlineLink.className = "button";
    $("#login").after(offlineLink);
    $("#login").onsubmit = (e) => {
      e.preventDefault();
      busy(
        e.submitter,
        async () => {
          let deviceId = localStorage.getItem("pseudopy_device_id");
          if (!deviceId) {
            deviceId = "dev_" + key();
            localStorage.setItem("pseudopy_device_id", deviceId);
          }
          user = await request("auth/login", {
            ...values(e.target),
            deviceId,
            deviceName: navigator.userAgent.slice(0, 150),
          });
          shell();
          const prefix = "/" + user.role + "/";
          await navigate(
            location.pathname.startsWith(prefix)
              ? location.pathname
              : prefix + "dashboard",
            true,
          );
        },
        "Signing in…",
      );
    };
  }
  async function navigate(path, replace = false) {
    if (
      dirty &&
      !(await confirmAction(
        "Unsaved changes",
        "Leave this page? Unsaved changes will remain only in this browser’s recovery draft.",
      ))
    )
      return;
    dirty = false;
    clearTimeout(autosave);
    worker?.terminate();
    worker = null;
    $("#modal")?.close();
    if (replace) history.replaceState({}, "", path);
    else if (location.pathname + location.search !== path)
      history.pushState({}, "", path);
    await render();
  }
  async function render() {
    if (!user) return;
    const version = ++pageVersion;
    const [role, route = "dashboard", id, mode] = location.pathname
      .split("/")
      .filter(Boolean);
    const container = $("#content");
    if (role !== user.role) {
      container.innerHTML =
        '<div class="error-box">Unauthorized route. Use your own workspace navigation.</div>';
      return;
    }
    $("#nav").innerHTML = nav();
    $("#crumb").textContent =
      menus[user.role].find((m) => m[0] === route)?.[2] || "Workspace";
    container.innerHTML =
      '<div class="skeleton" role="status" aria-label="Loading"></div>';
    report = null;
    generated = "";
    execution = null;
    task = null;
    try {
      let content;
      if (route === "translator") content = await translator();
      else if (route === "tasks")
        content = id ? await taskPage(id) : await tasks();
      else if (route === "classes")
        content = id ? await classPage(id) : await classes();
      else if (route === "exercises")
        content = id ? await exercisePage(id) : await exercises();
      else if (route === "assignments")
        content = id ? await assignmentPage(id) : await assignments();
      else if (route === "submissions")
        content = id ? await submissionPage(id) : await submissions();
      else if (route === "feedback") content = await feedback();
      else if (route === "analytics") content = await analytics();
      else if (route === "compiler-diagnostics") content = await diagnostics();
      else if (route === "students") content = await students();
      else if (route === "settings") content = settings();
      else if (route === "users") content = await usersPage(id);
      else if (route === "devices") content = await devices();
      else if (route === "audit") content = await audit();
      else if (route === "dashboard") content = await dashboard();
      else throw Error("Page not found.");
      if (version !== pageVersion) return;
      container.innerHTML = content;
      wireEditors();
      wirePage(route, id);
      container.focus({ preventScroll: true });
    } catch (e) {
      if (version === pageVersion && user)
        container.innerHTML = `<div class="error-box" role="alert">${esc(e.message)}<p><button id="retry">Retry</button></p></div>`;
      $("#retry")?.addEventListener("click", render);
    }
  }
  const heading = (title, subtitle = "", actions = "") =>
    `<div class="heading row between"><div><h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p></div><div class="row">${actions}</div></div>`;
  const empty = (text, action = "") =>
    `<div class="empty">${esc(text)}<p>${action}</p></div>`;
  function table(headers, rows) {
    return rows.length
      ? `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v, i) => `<td data-label="${esc(headers[i].replace(/<[^>]*>/g, ""))}">${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : empty("No records match this view.");
  }
  function filters(extra = "") {
    const q = Object.fromEntries(new URLSearchParams(location.search));
    return `<form id="filters" class="card filters">${field("search", "Search", q.search || "")}${extra}${select("status", "Status", [...(["assignments", "exercises"].includes(location.pathname.split("/")[2]) ? [["", "All"], "draft", "scheduled", "published", "closed", "archived"] : [["", "All"], "not_started", "in_progress", "submitted", "under_review", "reviewed", "revision_required", "overdue"])], q.status)}<button class="primary">Apply</button><button type="button" id="clear-filters">Clear filters</button></form><div class="row">${Object.entries(
      q,
    )
      .filter(([k, v]) => v && k !== "page")
      .map(
        ([k, v]) =>
          `<button class="chip" data-remove-filter="${esc(k)}">${esc(k)}: ${esc(v)} ×</button>`,
      )
      .join("")}</div>`;
  }
  const query = () => Object.fromEntries(new URLSearchParams(location.search));
  function pages(r) {
    return `<div class="row between"><small>${r.total} records · page ${r.page}</small><div class="row"><button data-page="${r.page - 1}" ${r.page <= 1 ? "disabled" : ""}>Previous</button><button data-page="${r.page + 1}" ${r.page * r.pageSize >= r.total ? "disabled" : ""}>Next</button></div></div>`;
  }
  function recoverKey(kind, id = "") {
    return `pseudopy_recovery_${user.id}_${kind}_${id}`;
  }
  function recover(kind, id, value) {
    try {
      localStorage.setItem(recoverKey(kind, id), value);
    } catch {
      notify(
        "Browser recovery storage is full. Save your draft to the server.",
        true,
      );
    }
  }
  function recoveryNotice(kind, id = "") {
    const source = localStorage.getItem(recoverKey(kind, id));
    return source !== null
      ? `<p class="warning">A browser recovery draft is available. <button data-recover="${kind}" data-id="${id}">Restore recovery draft</button></p>`
      : "";
  }
  async function translator() {
    translatorDraft = await api("translationDraft");
    return (
      heading(
        "Pseudocode Translator",
        "Write structured pseudocode, validate its syntax, and translate it into executable Python.",
        '<button data-guide>Syntax Guide</button><button id="history">Translation History</button>',
      ) +
      `<div class="stack">${recoveryNotice("translator")}<div class="row toolbar"><button data-editor-action="new">New</button><button id="open-file">Open File</button><input id="file" type="file" accept=".txt,.pseudo,.pseudocode" hidden><button id="save-translation-draft">Save Draft</button><button data-editor-action="format">Format</button><button data-editor-action="clear">Clear</button><small id="save-status">${translatorDraft.revision ? "Draft saved" : "New draft"}</small></div><label class="resize-control">Editor split<input id="split" type="range" min="30" max="65" value="50"></label><div class="split resizable" id="editors">${editor("source", "Pseudocode Editor", translatorDraft.pseudocode)}${editor("python", "Generated Python", "", true)}</div><div class="row between"><button id="translate" class="primary">Validate and Translate</button><div class="row"><button id="copy" disabled>Copy Code</button><button id="download" disabled>Download .py</button><button id="run" disabled>Run Python</button><button id="save-history" disabled>Save to History</button>${user.role === "instructor" ? '<button id="use-exercise" disabled>Use in Exercise Draft</button>' : ""}</div></div>${panels()}</div>`
    );
  }
  function panels() {
    return `<section class="card"><div class="tabs" role="tablist" aria-label="Processing feedback">${["Validation", "Execution Output", "Translation Details"].map((v, i) => `<button role="tab" id="tab-${i}" aria-controls="panel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${i}">${v}</button>`).join("")}</div><div id="panel" role="tabpanel" aria-labelledby="tab-0">Write pseudocode, then validate to see line-level feedback.</div></section>`;
  }
  function panel(which = 0) {
    document.querySelectorAll("[data-tab]").forEach((b) => {
      const active = Number(b.dataset.tab) === which;
      b.setAttribute("aria-selected", active);
      b.tabIndex = active ? 0 : -1;
    });
    const el = $("#panel");
    if (!el) return;
    el.setAttribute("aria-labelledby", "tab-" + which);
    if (which === 1) {
      el.innerHTML = execution
        ? `<p>${badge(execution.success ? "Execution successful" : "Runtime error")} · ${Math.round(execution.duration)} ms</p><pre>${esc(execution.output || "No output.")}</pre>`
        : "Run a successful translation to see console output.";
      return;
    }
    if (which === 2) {
      el.innerHTML = report
        ? `<p>${badge(report.valid ? "Translation successful" : "Translation blocked")}</p><ol><li>Lexical analysis</li><li>Syntactic validation</li><li>Semantic validation (warnings are advisory)</li><li>Semantic mapping</li><li>Python generation ${report.valid ? "completed" : "blocked"}</li></ol><p>Rule engine ${esc(report.ruleVersion)} · ${report.metrics?.totalTime ?? 0} ms</p><small>Validation confirms supported structure; it does not prove the algorithm solves the task.</small>`
        : "Translation stages will appear after validation.";
      return;
    }
    el.innerHTML = report
      ? `<p>${badge(report.valid ? "Validation successful" : "Validation failed")} · ${report.errors.length} errors · ${report.warnings.length} warnings</p>${[...report.errors, ...report.warnings].map((e) => `<button class="diagnostic" data-line="${Number(e.line) || 1}"><span>Line ${e.line} — ${esc(e.category)}<br>${esc(e.message)}<br><small>Current: ${esc(sourceValidated.split("\n")[(e.line || 1) - 1] || "")}<br>Suggested correction: ${esc(e.suggestion || "Check this statement against the syntax guide.")}</small></span></button>`).join("")}`
      : "Write pseudocode, then validate to see line-level feedback.";
  }
  async function validate(preview = false) {
    const el = $("#answer") || $("#source");
    const source = el.value,
      version = pageVersion;
    const result = await api(
      "validate",
      {
        pseudocode: source,
        ...(task ? { assignmentId: task.id, preview } : {}),
      },
      true,
    );
    if (el.value !== source || version !== pageVersion) return;
    sourceValidated = source;
    report = result;
    generated = report.valid ? report.python || "" : "";
    if ($("#python")) {
      $("#python").value = generated;
      $("#python").previousElementSibling.textContent = generated
        .split("\n")
        .map((_, i) => i + 1)
        .join("\n");
    }
    for (const id of [
      "copy",
      "download",
      "run",
      "save-history",
      "use-exercise",
    ])
      if ($("#" + id)) $("#" + id).disabled = !generated;
    $("#preview") && ($("#preview").disabled = !report.valid);
    $("#submit") && ($("#submit").disabled = !report.valid || !task.canEdit);
    panel();
    return report;
  }
  async function tasks() {
    const r = await api("assignments", query());
    const cls = await api("classes");
    return (
      heading(
        "Exercises & Tasks",
        "Your enrolled classes and assigned activities.",
        '<button id="join-class">Join a Class</button>',
      ) +
      `<div class="stack">${filters(select("classId", "Class", [["", "All classes"], ...cls.map((c) => [c.id, c.name])], query().classId))}<div class="grid">${r.items.map((a) => `<article class="card"><div class="row">${badge(a.snapshot.difficulty)}${badge(a.taskStatus)}${a.overdue ? badge("overdue") : ""}</div><h2>${esc(a.snapshot.title)}</h2><p>${esc(a.snapshot.description)}</p><p class="muted">Due ${date(a.dueAt)} · ${a.attempts} submitted attempts</p>${a.latest?.score !== undefined ? `<p>Score ${a.latest.score}/${a.snapshot.maxScore}</p>` : ""}${link("tasks/" + a.id, a.canEdit ? (a.taskStatus === "not_started" ? "Start Task" : "Continue Task") : "View Task", "button")}</article>`).join("") || empty("No assignments yet. Join a class or wait for your instructor to publish an activity.")} </div>${pages(r)}<section class="card"><h2>My classes</h2>${cls.map((c) => `<p>${esc(c.name)} · ${esc(c.section)} ${badge(c.enrollment)} ${badge(c.status)}</p>`).join("") || empty("You have not joined a class.")}</section></div>`
    );
  }
  function instructions(s, extra = "") {
    return `<details class="card" open><summary>Task instructions</summary><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p>${[
      ["Learning objective", s.objective],
      ["Instructions", extra || s.instructions],
      ["Required input", s.requiredInput],
      ["Expected output", s.expectedOutput],
      ["Constraints", s.constraints],
      ["Supported constructs", s.constructs],
      ["Sample input", s.sampleInput],
      ["Sample output", s.sampleOutput],
    ]
      .filter(([, v]) => v)
      .map(([l, v]) => `<h3>${l}</h3><pre>${esc(v)}</pre>`)
      .join(
        "",
      )}<h3>Rubric · ${s.maxScore} points</h3>${s.rubric.map((c) => `<p>${esc(c.label)} — ${c.max} points</p>`).join("")}</details>`;
  }
  async function taskPage(id) {
    task = await api("assignment", { id });
    draft = await api("draft", { assignmentId: id });
    return (
      heading(
        task.snapshot.title,
        `Due ${date(task.dueAt)} · Next attempt ${task.attempts + 1} · ${task.maxAttempts} standard attempts`,
        link("tasks", "Back to Tasks", "button"),
      ) +
      `<div class="stack"><div class="row">${badge(task.taskStatus)}${badge(task.status)}${badge(task.snapshot.difficulty)}</div>${instructions(task.snapshot, task.instructions)}${recoveryNotice("task", id)}${!task.canEdit ? '<p class="warning">This task is read-only. Your instructor must return or reopen a submitted attempt before another answer can be submitted.</p>' : ""}${editor("answer", "Your Pseudocode Answer", draft.pseudocodeAnswer, !task.canEdit)}<div class="row sticky-actions"><button id="save-task" ${!task.canEdit ? "disabled" : ""}>Save Draft</button><button id="validate-answer" ${!task.canEdit ? "disabled" : ""}>Validate Answer</button><button id="reset-task" ${!task.canEdit ? "disabled" : ""}>Reset Draft</button>${task.translationPreview ? '<button id="preview" disabled>Preview Translation</button>' : ""}<button id="submit" class="primary" disabled>Submit Answer</button><small id="save-status">${draft.revision ? "Draft saved" : "No draft saved"}</small></div><p class="muted">${task.latePolicy === "allow" ? "Late submissions are accepted and marked late." : "Late submissions are blocked."} Validation must pass before submission.</p>${task.snapshot.hints.length ? `<details class="card"><summary>Structured hints</summary><ul>${task.snapshot.hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></details>` : ""}${panels()}${task.latest ? link("submissions/" + task.latest.id, "View latest submission and feedback", "button") : ""}</div>`
    );
  }
  let saveQueue = Promise.resolve();
  function saveTask() {
    const version = pageVersion;
    const next = saveQueue
      .catch(() => {})
      .then(() => {
        if (version !== pageVersion) return;
        return saveTaskNow();
      });
    saveQueue = next;
    return next;
  }
  async function saveTaskNow() {
    const taskId = task.id,
      oldDraft = draft,
      version = pageVersion;
    const source = $("#answer").value;
    const status = $("#save-status");
    status.textContent = "Saving draft…";
    const saved = await api(
      "saveDraft",
      {
        assignmentId: taskId,
        pseudocodeAnswer: source,
        revision: oldDraft.revision,
      },
      true,
    );
    if (version !== pageVersion) return saved;
    draft = saved;
    if ($("#answer")?.value === source) {
      dirty = false;
      localStorage.removeItem(recoverKey("task", task.id));
      status.textContent = "Draft saved · " + date(saved.updatedAt);
    }
    return saved;
  }
  async function classes() {
    const rows = await api("classes");
    return (
      heading(
        "Classes",
        "Manage your classes and enrollment.",
        '<button id="new-class" class="primary">Create Class</button>',
      ) +
      `<div class="grid">${rows.map((c) => `<article class="card"><h2>${esc(c.name)}</h2><p>${esc(c.section)} · ${esc(c.subject)} · ${esc(c.period)}</p><p>${c.enrolled} enrolled ${badge(c.status)}</p>${link("classes/" + c.id, "Open Class", "button")}</article>`).join("") || empty("Create a class to begin assigning activities.")}</div>`
    );
  }
  let currentClass = null,
    exercise = null,
    assignmentFormData = null,
    submission = null;
  async function classPage(id) {
    currentClass = await api("classDetail", { id });
    const c = currentClass;
    return (
      heading(
        c.name,
        `${c.section} · ${c.subject} · ${c.period}`,
        link("classes", "Back to Classes", "button") +
          '<button id="edit-class">Edit Class</button>',
      ) +
      `<div class="stack"><section class="card"><p>Class code: <strong>${esc(c.joinCode)}</strong> ${badge(c.status)}</p><div class="row"><button id="enroll-student" ${c.status === "archived" ? "disabled" : ""}>Add Student</button><button id="announcement" ${c.status === "archived" ? "disabled" : ""}>Post Announcement</button><button id="archive-class">${c.status === "active" ? "Archive" : "Restore"} Class</button>${link("assignments?classId=" + id, "Class Assignments", "button")}${link("analytics?classId=" + id, "Class Performance", "button")}</div></section><section class="card"><h2>Enrollment</h2>${table(
        ["Student", "Student ID", "Status", "Actions"],
        c.enrollments.map((e) => [
          esc(e.student.fullName || e.studentId),
          esc(e.student.studentId),
          badge(e.status),
          c.status === "active"
            ? `<div class="row">${e.status !== "active" ? `<button data-enroll="${e.studentId}" data-status="active">${e.status === "pending" ? "Approve" : "Enroll"}</button>` : ""}${e.status !== "removed" ? `<button data-enroll="${e.studentId}" data-status="removed">${e.status === "pending" ? "Reject" : "Remove"}</button>` : ""}</div>`
            : "Read-only",
        ]),
      )}</section></div>`
    );
  }
  function classDialog(c = {}) {
    const d = dialog(
      c.id ? "Edit Class" : "Create Class",
      `<form id="class-form" class="stack">${field("name", "Class name", c.name, "text", true)}${field("section", "Section", c.section, "text", true)}${field("subject", "Subject", c.subject, "text", true)}${field("period", "Academic period", c.period, "text", true)}<p id="form-error" class="error"></p><button class="primary">Save Class</button></form>`,
    );
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        const saved = await api(
          "saveClass",
          { ...c, ...values(e.target) },
          true,
        );
        d.close();
        await navigate("/" + user.role + "/classes/" + saved.id);
        notify("Class saved.");
      });
    };
  }
  async function exercises() {
    const r = await api("exercises", query());
    return (
      heading(
        "Exercise Library",
        "Reusable content and private reference answers.",
        link("exercises/new", "Create Exercise", "button primary"),
      ) +
      `<div class="stack">${filters()}<div class="grid">${r.items.map((e) => `<article class="card"><h2>${esc(e.title)}</h2><p>${esc(e.objective)}</p><p>${badge(e.status)} ${badge(e.difficulty)} · ${e.maxScore} points</p>${link("exercises/" + e.id + "/edit", "Edit Exercise", "button")} <button data-duplicate="${e.id}">Duplicate</button></article>`).join("") || empty("Create an exercise with a validated reference and rubric.")}</div>${pages(r)}</div>`
    );
  }
  async function exercisePage(id) {
    exercise = id === "new" ? {} : await api("exercise", { id });
    const e = exercise;
    return (
      heading(
        e.id ? "Edit Exercise" : "Create Exercise",
        "Reference pseudocode and Python remain private.",
        link("exercises", "Back to Library", "button"),
      ) +
      `<form id="exercise-form" class="stack"><div class="card grid">${field("title", "Title", e.title, "text", true)}${field("objective", "Learning objective", e.objective)}${select("difficulty", "Difficulty", ["easy", "moderate", "hard"], e.difficulty || "moderate")}${field("tags", "Tags", e.tags)}${select("status", "Status", ["draft", "published", "archived"], e.status)}</div><div class="card grid">${area("description", "Problem description", e.description)}${area("instructions", "Instructions", e.instructions)}${area("requiredInput", "Required input", e.requiredInput)}${area("expectedOutput", "Expected output", e.expectedOutput)}${area("constraints", "Constraints", e.constraints)}${area("constructs", "Supported constructs", e.constructs)}${area("sampleInput", "Sample input", e.sampleInput)}${area("sampleOutput", "Sample output", e.sampleOutput)}${area("hints", "Structured hints (one per line)", (e.hints || []).join("\n"))}</div><div class="split">${editor("source", "Instructor Reference Pseudocode", e.referencePseudocode || "")}${editor("python", "Expected Python", e.expectedPython || "", true)}</div><section class="card"><h2>Grading rubric</h2><p class="muted">One criterion per line: label | maximum points. Total must be 1–1000.</p>${area(
        "rubricText",
        "Rubric",
        (
          e.rubric || [
            { label: "Algorithm correctness", max: 60 },
            { label: "Structure and clarity", max: 40 },
          ]
        )
          .map((r) => r.label + " | " + r.max)
          .join("\n"),
      )}</section><div class="row"><button type="button" id="validate-reference">Validate Reference Answer</button><button type="button" id="student-preview">Preview as Student</button><button class="primary">Save Exercise</button>${e.id ? link("assignments/new?exerciseId=" + e.id, "Create Assignment", "button") : ""}</div><p id="form-error" class="error"></p>${panels()}</form>`
    );
  }
  function exerciseInput() {
    const v = values($("#exercise-form"));
    v.referencePseudocode = $("#source").value;
    v.rubric = v.rubricText
      .split("\n")
      .filter((s) => s.trim())
      .map((line, i) => {
        const [label, max] = line.split("|");
        return {
          id: exercise.rubric?.[i]?.id || "criterion_" + i,
          label: label.trim(),
          max: Number(max),
        };
      });
    return { ...exercise, ...v };
  }
  async function assignments() {
    const r = await api("assignments", query()),
      cls = await api("classes");
    return (
      heading(
        "Assignments",
        "Publish exercises to enrolled students.",
        link("assignments/new", "Create Assignment", "button primary"),
      ) +
      `<div class="stack">${filters(select("classId", "Class", [["", "All classes"], ...cls.map((c) => [c.id, c.name])], query().classId))}${table(
        ["Assignment", "Class", "State", "Available", "Due", "Actions"],
        r.items.map((a) => [
          esc(a.snapshot.title),
          esc(cls.find((c) => c.id === a.classId)?.name || a.classId),
          badge(a.status),
          date(a.availableAt),
          date(a.dueAt),
          link("assignments/" + a.id, "Manage Assignment"),
        ]),
      )}${pages(r)}</div>`
    );
  }
  const localTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  async function assignmentPage(id) {
    const [cls, ex] = await Promise.all([
      api("classes"),
      api("exercises", { pageSize: 100 }),
    ]);
    assignmentFormData = id === "new" ? {} : await api("assignment", { id });
    const a = assignmentFormData;
    return (
      heading(
        a.id ? "Manage Assignment" : "Create Assignment",
        "Publication and notifications are saved together.",
        link("assignments", "Back to Assignments", "button"),
      ) +
      `<form id="assignment-form" class="card stack"><div class="grid">${select("exerciseId", "Exercise", [["", "Choose an exercise"], ...ex.items.map((e) => [e.id, e.title])], a.exerciseId || query().exerciseId)}${select("classId", "Target class", [["", "Choose a class"], ...cls.filter((c) => c.status === "active").map((c) => [c.id, c.name + " · " + c.section])], a.classId || query().classId)}${select("status", "State", ["draft", "scheduled", "published", "closed", "archived"], a.status)}${field("availableAt", "Available from (your device timezone)", localTime(a.availableAt), "datetime-local", true)}${field("dueAt", "Due date (your device timezone)", localTime(a.dueAt), "datetime-local", true)}${field("maxAttempts", "Maximum attempts", a.maxAttempts || 1, "number", true)}${field("passingScore", "Passing score", a.passingScore ?? 60, "number", true)}${select(
        "latePolicy",
        "Late submissions",
        [
          ["block", "Block"],
          ["allow", "Allow and mark late"],
        ],
        a.latePolicy,
      )}</div>${field("studentIds", "Selected account IDs (comma separated; blank means whole class)", (a.studentIds || []).join(", "))}<p class="muted">Copy stable account IDs from the Students page. All selected students must be enrolled.</p><div class="grid">${checkbox("hintsEnabled", "Allow structured hints", a.hintsEnabled)}${checkbox("translationPreview", "Allow translation preview", a.translationPreview)}${checkbox("executionPreview", "Allow execution preview (also requires translation preview)", a.executionPreview)}</div><p>Feedback release policy: Instructor manually releases feedback.</p>${area("instructions", "Assignment instructions", a.instructions)}<p id="form-error" class="error"></p><button class="primary">${a.id ? "Save Changes" : "Save Assignment"}</button>${a.id ? link("submissions?assignmentId=" + a.id, "View Submissions", "button") : ""}</form>`
    );
  }
  async function students() {
    const rows = await api("students");
    return (
      heading(
        "Students",
        "Active roster accounts. Add students through a class.",
      ) +
      table(
        ["Name", "Student ID", "Account ID", "Status"],
        rows.map((s) => [
          esc(s.fullName),
          esc(s.studentId),
          esc(s.id),
          badge(s.status),
        ]),
      )
    );
  }
  async function submissionFilters() {
    const q = query(),
      cls = await api("classes"),
      as = await api("assignments", { pageSize: 100 });
    return filters(
      select(
        "classId",
        "Class",
        [["", "All classes"], ...cls.map((c) => [c.id, c.name])],
        q.classId,
      ) +
        select(
          "assignmentId",
          "Assignment",
          [
            ["", "All assignments"],
            ...as.items.map((a) => [a.id, a.snapshot.title]),
          ],
          q.assignmentId,
        ) +
        field("from", "From", q.from || "", "date") +
        field("to", "Through", q.to || "", "date") +
        select(
          "late",
          "Late status",
          [
            ["", "Any"],
            ["true", "Late only"],
          ],
          q.late,
        ),
    );
  }
  function attemptTable(r) {
    const headers = [
      "Student",
      "Student ID",
      "Assignment",
      "Attempt",
      "Submitted",
      "Validation",
      "Review status",
      "Score",
      "Late",
      "Actions",
    ];
    headers[0] = '<button data-sort="studentName">Student ↕</button>';
    headers[3] = '<button data-sort="attemptNumber">Attempt ↕</button>';
    headers[4] = '<button data-sort="submittedAt">Submitted ↕</button>';
    headers[7] = '<button data-sort="score">Score ↕</button>';
    return (
      table(
        headers,
        r.items.map((s) => [
          esc(s.studentName),
          esc(s.studentNumber),
          esc(s.assignmentSnapshot.title),
          s.attemptNumber,
          date(s.submittedAt),
          badge(s.validation.valid ? "valid" : "invalid"),
          badge(s.status),
          s.score === undefined
            ? "Not released"
            : s.score + "/" + s.assignmentSnapshot.maxScore,
          s.late ? "Late" : "On time",
          link("submissions/" + s.id, "View Submission"),
        ]),
      ) + pages(r)
    );
  }
  async function submissions() {
    const r = await api("submissions", query());
    const drafts = user.role === "student" ? await api("taskDrafts") : [];
    return (
      heading(
        user.role === "student" ? "My Submissions" : "Submission Review Queue",
        "Immutable submitted attempts. Translator history is kept separately.",
      ) +
      `<div class="stack">${await submissionFilters()}${drafts.length ? '<section class="card"><h2>Unsubmitted drafts</h2>' + drafts.map((d) => "<p>" + link("tasks/" + d.assignmentId, d.title) + " · " + date(d.updatedAt) + "</p>").join("") + "</section>" : ""}${attemptTable(r)}</div>`
    );
  }
  function reviewCard(r, max) {
    return `<article class="card"><div class="row between"><h3>Instructor feedback</h3>${badge(r.status === "superseded" ? "superseded" : r.viewedAt ? "viewed" : r.status)}</div><p>${esc(r.reviewerName || "Instructor")} · ${date(r.createdAt)} · ${badge(r.decision)} · Score ${r.score}/${max}</p><pre>${esc(r.feedback || "No general feedback.")}</pre><ul>${r.breakdown.map((b) => `<li>${esc(b.criterionId)}: ${b.score}</li>`).join("")}${r.comments.map((c) => `<li>Line ${c.line}: ${esc(c.text)}</li>`).join("")}</ul>${r.decision === "revision_required" ? '<p class="warning">Next action: revise your answer after checking the attempt and deadline policy.</p>' : ""}</article>`;
  }
  async function submissionPage(id) {
    submission = await api("submission", { id });
    const s = submission;
    const previous = await api("submissions", {
      assignmentId: s.assignmentId,
      pageSize: 100,
    });
    const instructor = user.role !== "student";
    const last = s.reviews[0];
    return (
      heading(
        s.assignmentSnapshot.title,
        `${s.studentName} · ${s.studentNumber} · Attempt ${s.attemptNumber} · ${date(s.submittedAt)}`,
        link("submissions", "Back to Submissions", "button"),
      ) +
      `<div class="stack"><div class="row">${badge(s.status)}${badge(s.late ? "late" : "on time")}${badge("immutable attempt")}${badge("validation passed")}</div>${instructions(s.assignmentSnapshot)}<div class="split">${editor("submitted-source", "Submitted Pseudocode", s.pseudocodeAnswer, true)}${s.generatedPython ? editor("python", "Generated Python", s.generatedPython, true) : '<section class="card"><h2>Validation details</h2><p>Your answer passed grammar validation. Translation preview was disabled for this attempt.</p></section>'}</div>${s.generatedPython && (instructor || s.assignmentSnapshot.executionPreview) ? '<button id="run-submission">Run Submitted Python</button><pre id="submission-output">No execution recorded in this view.</pre>' : ""}<section class="card"><h2>Attempts</h2><div class="row">${previous.items
        .filter((a) => a.studentId === s.studentId)
        .map((a) =>
          link("submissions/" + a.id, "Attempt " + a.attemptNumber, "button"),
        )
        .join(
          "",
        )}</div></section>${instructor ? `<form id="review-form" class="card stack"><h2>Rubric and Feedback</h2><div class="grid">${s.assignmentSnapshot.rubric.map((c) => field(c.id, c.label + " / " + c.max, last?.breakdown.find((b) => b.criterionId === c.id)?.score ?? 0, "number", true)).join("")}</div>${area("feedback", "General feedback", last?.feedback)}${area("commentsText", "Line comments (line number | comment)", (last?.comments || []).map((c) => c.line + " | " + c.text).join("\n"))}${select("decision", "Decision", ["reviewed", "revision_required"], last?.decision)}<p class="muted">Scores are the sum of rubric criteria, limited to ${s.assignmentSnapshot.maxScore}. Draft reviews stay private.</p><p id="form-error" class="error"></p><div class="row"><button name="reviewAction" value="draft">Save Review Draft</button><button name="reviewAction" value="release" class="primary">Release Feedback</button><button type="button" id="reopen">Reopen Attempt</button></div></form>` : link("tasks/" + s.assignmentId, "Open Task", "button")}${s.reviews.map((r) => reviewCard(r, s.assignmentSnapshot.maxScore)).join("") || empty("Awaiting instructor review.")}</div>`
    );
  }
  async function feedback() {
    const [rows, attempts] = await Promise.all([
      api("feedback"),
      api("submissions", { pageSize: 100 }),
    ]);
    return (
      heading(
        "Feedback",
        "Released instructor feedback and validation reports for your coursework.",
      ) +
      `<div class="stack"><section class="card"><h2>Instructor feedback</h2>${rows.map((r) => `<p>${link("submissions/" + r.attemptId, r.task + " · Attempt " + r.attemptNumber)} · ${date(r.createdAt)} ${badge(r.decision)} ${badge(r.viewedAt ? "viewed" : "released")}</p>`).join("") || empty("No released feedback yet.")}</section><section class="card"><h2>Automated validation feedback</h2>${attempts.items.map((s) => `<p>${link("submissions/" + s.id, s.assignmentSnapshot.title + " · Attempt " + s.attemptNumber)} · ${s.validation.errors.length} errors · ${s.validation.warnings.length} warnings · Compiler · ${date(s.submittedAt)}</p>`).join("") || empty("Validation reports appear after submission.")}</section></div>`
    );
  }
  async function analytics() {
    const [a, r] = await Promise.all([
      api("analytics", query()),
      api("submissions", query()),
    ]);
    const maximum = Math.max(1, ...a.activity.map((p) => p.count)),
      total = Object.values(a.errors).reduce((x, y) => x + y, 0);
    return (
      heading(
        "Learning Analytics",
        "Activity records describe participation, not proven learning gains.",
      ) +
      `<div class="stack">${await submissionFilters()}<p class="muted">Last updated ${date(a.lastUpdated)}. Completion counts student–assignment pairs in the selected classes; activity filters apply to recorded attempts.</p><div class="grid">${[
        ["Enrolled students", a.enrolled],
        ["Students who started", a.started],
        ["Submitted attempts", a.submittedAttempts],
        ["Unique students submitted", a.uniqueSubmitted],
        ["Pending reviews", a.pendingReviews],
        [
          "Average released score",
          a.averageScore === null ? "No scores" : a.averageScore.toFixed(1),
        ],
        [
          "Completion",
          `${a.completion.numerator} / ${a.completion.denominator}`,
        ],
      ]
        .map(
          ([k, v]) =>
            `<section class="card metric"><small>${k}</small><strong>${v}</strong></section>`,
        )
        .join(
          "",
        )}</div><section class="card"><h2>Submission activity</h2><p class="muted">Baseline: 0 attempts. Each bar shows its exact count. Select a day to filter the table.</p>${
        a.activity.length
          ? `<div class="chart">${a.activity.map((p) => `<div class="bar"><span>${p.count}</span><button style="height:${Math.max(2, (150 * p.count) / maximum)}px" data-day="${p.date}" aria-label="${p.date}: ${p.count} attempts" title="${p.date}: ${p.count} attempts"></button><small>${p.date.slice(5)}</small></div>`).join("")}</div><details><summary>Activity data table</summary>${table(
              ["Date", "Attempts"],
              a.activity.map((p) => [p.date, p.count]),
            )}</details>`
          : empty("No submissions in this period.")
      }</section><section class="card"><h2>Validation errors</h2>${table(
        ["Category", "Count", "Percentage"],
        Object.entries(a.errors).map(([k, v]) => [
          esc(k),
          v,
          total ? ((100 * v) / total).toFixed(1) + "%" : "0%",
        ]),
      )}</section><section class="card"><h2>Submission records</h2>${attemptTable(r)}</section></div>`
    );
  }
  async function diagnostics() {
    const d = await api("diagnostics");
    return (
      heading(
        "Compiler Diagnostics",
        "Aggregated processing records; browser execution results are self-reported.",
      ) +
      `<div class="grid">${[
        ["Rule engine", d.ruleVersion],
        ["Validation requests", d.requests],
        [
          "Translation success",
          d.requests
            ? ((100 * d.successes) / d.requests).toFixed(1) + "%"
            : "No requests",
        ],
        [
          "Average processing time",
          d.averageDuration === null
            ? "No requests"
            : d.averageDuration.toFixed(2) + " ms",
        ],
        ["Validation failures", d.failedProcessingJobs],
        ["Browser executions", d.executions],
        [
          "Execution success",
          d.executions
            ? ((100 * d.executionSuccesses) / d.executions).toFixed(1) + "%"
            : "No executions",
        ],
      ]
        .map(
          ([k, v]) =>
            `<section class="card"><h2>${k}</h2><p>${v}</p></section>`,
        )
        .join(
          "",
        )}</div><section class="card stack"><h2>Inspect an AST</h2>${area("inspectSource", "Pseudocode to inspect", "BEGIN\nOUTPUT 1 + 2 * 3\nEND")}<button id="inspect-ast">Inspect AST</button><pre id="ast-output">Enter structured pseudocode to inspect its syntax tree.</pre></section>`
    );
  }
  async function dashboard() {
    if (user.role === "student") {
      const [a, f, c] = await Promise.all([
        api("assignments", { pageSize: 5 }),
        api("feedback"),
        api("classes"),
      ]);
      return (
        heading(
          "Dashboard",
          "Plan your coursework, practice pseudocode, and review feedback.",
        ) +
        `<div class="grid"><section class="card metric"><small>Visible assignments</small><strong>${a.total}</strong>${link("tasks", "View Tasks", "button")}</section><section class="card metric"><small>Released feedback records</small><strong>${f.length}</strong>${link("feedback", "Read Feedback", "button")}</section><section class="card"><h2>Practice independently</h2><p>Use the translator without creating a graded submission.</p>${link("translator", "Open Translator", "button")}</section></div><section class="card"><h2>Upcoming tasks</h2>${a.items.map((t) => `<p>${link("tasks/" + t.id, t.snapshot.title)} · ${date(t.dueAt)} ${badge(t.taskStatus)}</p>`).join("") || empty("Join a class from Exercises & Tasks to begin.")}</section>`
      );
    }
    if (user.role === "admin") {
      const [u, d] = await Promise.all([account("users"), account("devices")]);
      return (
        heading(
          "Administration",
          "Manage account access and instructor device approvals.",
        ) +
        `<div class="grid"><section class="card metric"><small>Accounts</small><strong>${u.length}</strong>${link("users", "Manage Accounts", "button")}</section><section class="card metric"><small>Pending devices</small><strong>${d.filter((d) => d.status === "pending").length}</strong>${link("devices", "Review Devices", "button")}</section></div>`
      );
    }
    const a = await api("analytics", {});
    return (
      heading(
        "Instructor Dashboard",
        "Your classes, assignment activity, and review workload.",
      ) +
      `<div class="grid">${[
        ["Active classes", a.activeClasses, "classes"],
        ["Published assignments", a.publishedAssignments, "assignments"],
        ["Enrolled students", a.enrolled, "students"],
        ["Pending reviews", a.pendingReviews, "submissions"],
        ["Missing overdue submissions", a.overdue, "analytics"],
      ]
        .map(
          ([label, n, route]) =>
            `<section class="card metric"><small>${label}</small><strong>${n}</strong>${link(route, "View " + label, "button")}</section>`,
        )
        .join("")}</div>`
    );
  }
  function settings() {
    return (
      heading("Settings", "Your profile and display preferences.") +
      `<div class="stack"><section class="card"><h2>${esc(user.fullName)}</h2><p>${esc(user.username)} · ${esc(user.role)}</p></section><form id="settings-form" class="card stack">${field("timezone", "Display timezone (for example Asia/Manila)", user.timezone || "UTC")}<button class="primary">Save Preferences</button></form><form id="password-form" class="card stack"><h2>Change password</h2>${field("currentPassword", "Current password", "", "password", true)}${field("password", "New password (10–256 characters)", "", "password", true)}<button>Update Password and Sign Out</button></form></div>`
    );
  }
  let editingAccount = null;
  async function usersPage(id) {
    if (id) {
      editingAccount =
        id === "new" ? {} : (await account("users")).find((u) => u.id === id);
      if (!editingAccount) throw Error("Account not found.");
      const u = editingAccount;
      return (
        heading(
          u.id ? "Edit Account" : "Create Account",
          "Existing records and historical attempts are preserved.",
          link("users", "Back to Accounts", "button"),
        ) +
        `<form id="user-form" class="card stack">${field("fullName", "Full name", u.fullName, "text", true)}${field("username", "Username", u.username, "text", true)}${field("studentId", "Student ID", u.studentId)}${field("email", "Email", u.email, "email")}${select("role", "Role", ["student", "instructor", "admin"], u.role)}${select("status", "Status", ["active", "inactive", "archived"], u.status)}${field("password", u.id ? "New password (leave empty to retain)" : "Initial password", "", "password", !u.id)}<p id="form-error" class="error"></p><button class="primary">Save Account</button></form>`
      );
    }
    const rows = await account("users");
    return (
      heading(
        "Accounts",
        "Manage real accounts; no automatic sample users.",
        link("users/new", "Create Account", "button primary"),
      ) +
      table(
        ["Name", "Username", "Role", "Status", "Actions"],
        rows.map((u) => [
          esc(u.fullName),
          esc(u.username),
          badge(u.role),
          badge(u.status),
          link("users/" + u.id, "Edit Account"),
        ]),
      )
    );
  }
  async function devices() {
    const rows = await account("devices");
    return (
      heading(
        "Device Approvals",
        "Instructor sign-ins on additional devices require approval.",
      ) +
      table(
        ["Instructor", "Device", "Requested", "Status", "Actions"],
        rows.map((d) => [
          esc(d.username),
          esc(d.deviceName),
          date(d.requestedAt),
          badge(d.status),
          `<button data-device="${d.id}" data-status="${d.status === "approved" ? "revoked" : "approved"}">${d.status === "approved" ? "Revoke" : "Approve"}</button>`,
        ]),
      )
    );
  }
  async function audit() {
    const rows = await account("audit");
    return (
      heading("Audit Log", "Most recent 200 account and device events.") +
      table(
        ["Time", "Actor", "Event", "Target"],
        rows.map((r) => [
          date(r.timestamp),
          esc(r.actor),
          esc(r.event || r.eventType),
          esc(r.target),
        ]),
      )
    );
  }
  async function showNotifications() {
    const rows = await api("notifications");
    const d = dialog(
      "Notifications",
      rows
        .map(
          (n) =>
            `<article class="card"><a href="${esc(n.href)}" data-route data-notification="${n.id}">${esc(n.title)}</a><p><small>${date(n.createdAt)} · ${n.readAt ? "Read" : "Unread"}</small></p></article>`,
        )
        .join("") || empty("You are up to date."),
      true,
    );
  }
  const guide = [
    ["Program structure", "BEGIN (or START)\n…\nEND"],
    [
      "Variables and data types",
      "DECLARE count AS INTEGER\nSET count TO 0\nTypes: INTEGER, FLOAT, REAL, STRING, BOOLEAN, ARRAY",
    ],
    [
      "Input and output",
      "INPUT count\nOUTPUT count\nTyped INPUT requires a declaration.",
    ],
    [
      "Arithmetic operations",
      "+  -  *  /  //  MOD (%)  **\n/ true division; // floor division; ** power; ^ bitwise XOR.",
    ],
    [
      "Conditionals",
      'IF score >= 75 THEN\nOUTPUT "Passed"\nELSE\nOUTPUT "Try again"\nEND IF',
    ],
    [
      "Loops",
      "FOR i FROM 1 TO 9 STEP 2 DO\nOUTPUT i\nEND FOR\nBounds are inclusive. STEP cannot be zero.\nWHILE condition DO … END WHILE",
    ],
    [
      "Logical and comparison operators",
      "AND OR NOT; = or == equality; != or <> inequality; < <= > >=.\nNOT binds below comparisons. Parentheses override precedence.",
    ],
    [
      "Supported examples",
      "BEGIN\nSET total TO 0\nFOR i FROM 1 TO 89 STEP 2 DO\nSET total TO total + i\nEND FOR\nOUTPUT total\nEND",
    ],
    [
      "Unsupported constructs",
      "No unrestricted natural language, imports, classes, GUI programs, database programs, or multi-language output. Validation does not prove algorithm correctness.",
    ],
  ];
  function syntaxGuide() {
    const d = dialog(
      "Syntax Guide",
      `<label>Search rules<input id="guide-search" type="search"></label><div id="guide-results"></div>`,
      true,
    );
    const draw = () =>
      (d.querySelector("#guide-results").innerHTML =
        guide
          .filter(([k, v]) =>
            (k + v)
              .toLowerCase()
              .includes(d.querySelector("input").value.toLowerCase()),
          )
          .map(
            ([k, v]) => `<section><h3>${k}</h3><pre>${esc(v)}</pre></section>`,
          )
          .join("") || empty("No matching rules."));
    d.querySelector("input").oninput = draw;
    draw();
  }
  async function historyDialog() {
    const r = await api("translations", { pageSize: 100 });
    const d = dialog(
      "Translation History",
      r.items
        .map(
          (t) =>
            `<article class="card"><p>${date(t.createdAt)}</p><pre>${esc(t.pseudocode.slice(0, 300))}</pre><button data-open-translation="${t.id}">Open Translation</button></article>`,
        )
        .join("") ||
        empty("Translate valid pseudocode, then save it to history."),
    );
    d.querySelectorAll("[data-open-translation]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (
            dirty &&
            !(await confirmAction(
              "Replace editor content",
              "Open this translation and replace your current editor content?",
            ))
          )
            return;
          setCode(
            "#source",
            r.items.find((t) => t.id === b.dataset.openTranslation).pseudocode,
          );
          d.close();
        }),
    );
  }
  async function runPython(code, assignmentId = null) {
    const d = dialog(
      "Console Input",
      `<form class="stack">${area("stdin", "Input values (one per INPUT statement)", "")}<p>Runs in an isolated browser worker with a 5-second limit. No files, network modules, or server execution.</p><button class="primary">Run Program</button></form>`,
    );
    const input = await new Promise((resolve) => {
      let accepted = false;
      d.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        accepted = true;
        resolve(values(e.target).stdin.split("\n"));
        d.close();
      };
      d.addEventListener("close", () => {
        if (!accepted) resolve(null);
      });
    });
    if (!input) return null;
    notify("Executing…");
    const start = performance.now();
    return new Promise((resolve) => {
      worker?.terminate();
      worker = new Worker("/execution-worker.js");
      const current = worker;
      let done = false;
      const finish = async (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        current.terminate();
        worker = null;
        execution = { ...result, duration: performance.now() - start };
        notify(
          result.success
            ? "Execution successful."
            : "Runtime error: " + result.output,
          !result.success,
        );
        if ($("#panel")) panel(1);
        if ($("#submission-output"))
          $("#submission-output").textContent =
            execution.output || "No output.";
        resolve(execution);
        try {
          await api(
            "logExecution",
            {
              assignmentId,
              success: result.success,
              duration: execution.duration,
            },
            true,
          );
        } catch (e) {
          notify(
            "Execution finished, but its diagnostic record was not saved. " +
              e.message,
            true,
          );
        }
      };
      const timer = setTimeout(
        () =>
          finish({
            success: false,
            output: "Execution stopped after the 5-second limit.",
          }),
        5000,
      );
      current.onmessage = (e) => finish(e.data);
      current.onerror = () =>
        finish({
          success: false,
          output: "The browser Python runtime could not load.",
        });
      current.postMessage({ code, input });
    });
  }
  function clearGenerated() {
    report = null;
    generated = "";
    execution = null;
    sourceValidated = "";
    if ($("#python")) $("#python").value = "";
    for (const id of [
      "copy",
      "download",
      "run",
      "save-history",
      "use-exercise",
      "preview",
      "submit",
    ])
      if ($("#" + id)) $("#" + id).disabled = true;
    panel();
  }
  function wirePage(route, id) {
    const on = (selector, event, fn) =>
      $(selector)?.addEventListener(event, fn);
    const action = (selector, fn, label) =>
      on(selector, "click", (e) => busy(e.currentTarget, fn, label));
    on("#filters", "submit", (e) => {
      e.preventDefault();
      const q = new URLSearchParams();
      Object.entries(values(e.target)).forEach(([k, v]) => {
        if (v) q.set(k, v);
      });
      navigate(location.pathname + "?" + q);
    });
    action("#clear-filters", () => navigate(location.pathname));
    on("#split", "input", (e) =>
      $("#editors").style.setProperty("--left", e.target.value + "%"),
    );
    on("#source", "input", () => {
      dirty = true;
      recover(
        route === "translator" ? "translator" : "exercise",
        route === "translator" ? "" : id || "",
        $("#source").value,
      );
      clearGenerated();
      if ($("#save-status")) $("#save-status").textContent = "Unsaved changes";
    });
    on("#answer", "input", () => {
      if (!task.canEdit) return;
      dirty = true;
      recover("task", task.id, $("#answer").value);
      clearGenerated();
      $("#save-status").textContent = "Unsaved changes";
      clearTimeout(autosave);
      autosave = setTimeout(() => {
        saveTask().catch((e) => {
          if ($("#save-status"))
            $("#save-status").textContent = "Not saved — retry";
          notify(e.message, true);
        });
      }, 1200);
    });
    action("#inspect-ast", async () => {
      const r = await api("inspect", {
        pseudocode: document.querySelector("[name=inspectSource]").value,
      });
      $("#ast-output").textContent = JSON.stringify(r, null, 2);
    });
    action("#translate", () => validate(), "Validating…");
    action("#validate-answer", () => validate(), "Validating…");
    action("#validate-reference", () => validate(), "Validating…");
    action(
      "#save-translation-draft",
      async () => {
        translatorDraft = await api(
          "saveTranslationDraft",
          {
            pseudocode: $("#source").value,
            revision: translatorDraft.revision,
          },
          true,
        );
        dirty = false;
        localStorage.removeItem(recoverKey("translator"));
        $("#save-status").textContent = "Draft saved";
      },
      "Saving…",
    );
    action("#history", historyDialog);
    action("#save-history", async () => {
      await api("saveTranslation", { pseudocode: sourceValidated }, true);
      notify("Translation saved to private history.");
    });
    action("#copy", async () => {
      await navigator.clipboard.writeText(generated);
      notify("Python copied.");
    });
    action("#download", () => {
      const url = URL.createObjectURL(
        new Blob([generated], { type: "text/x-python" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "pseudopy.py";
      a.click();
      URL.revokeObjectURL(url);
    });
    action("#run", () => runPython(generated));
    action("#open-file", () => $("#file").click());
    on("#file", "change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 60000)
        return notify("Choose a text file under 60 KB.", true);
      if (
        dirty &&
        !(await confirmAction(
          "Open file",
          "Replace the editor with this file?",
        ))
      )
        return;
      setCode("#source", await file.text());
    });
    action("#save-task", saveTask, "Saving…");
    action("#reset-task", async () => {
      if (
        await confirmAction(
          "Reset draft",
          "Clear this unsent draft? Submitted attempts remain unchanged.",
        )
      ) {
        setCode("#answer", "");
        clearTimeout(autosave);
        await saveTask();
      }
    });
    action("#preview", async () => {
      const r = await validate(true);
      if (!r.valid) return;
      const d = dialog(
        "Your Translation Preview",
        `<pre>${esc(r.python)}</pre>${task.executionPreview ? '<button id="run-preview">Run Python</button>' : ""}`,
      );
      d.querySelector("#run-preview")?.addEventListener("click", () => {
        d.close();
        runPython(r.python, task.id);
      });
    });
    action(
      "#submit",
      async () => {
        clearTimeout(autosave);
        if (
          !(await confirmAction(
            "Submit final answer",
            "Create an immutable submission attempt? Your instructor will receive this exact answer.",
          ))
        )
          return;
        await saveQueue.catch(() => {});
        const saved = await api(
          "submit",
          { assignmentId: task.id, pseudocodeAnswer: $("#answer").value },
          true,
        );
        dirty = false;
        localStorage.removeItem(recoverKey("task", task.id));
        await navigate("/student/submissions/" + saved.id);
        notify(
          "Answer submitted successfully. Attempt " + saved.attemptNumber + ".",
        );
      },
      "Submitting…",
    );
    action("#new-class", () => classDialog());
    action("#edit-class", () => classDialog(currentClass));
    action("#archive-class", async () => {
      if (
        await confirmAction(
          "Change class status",
          "Archived classes become read-only. Restore to resume activity.",
        )
      ) {
        await api(
          "saveClass",
          {
            ...currentClass,
            status: currentClass.status === "active" ? "archived" : "active",
          },
          true,
        );
        await render();
      }
    });
    action("#join-class", () =>
      simpleForm("Join a Class", "code", "Class code", async (v) => {
        await api("joinClass", v, true);
        await render();
        notify("Join request sent. Assignments appear after approval.");
      }),
    );
    action("#enroll-student", () =>
      simpleForm(
        "Add Student",
        "studentId",
        "Account ID or student ID",
        async (v) => {
          await api("enroll", { ...v, classId: currentClass.id }, true);
          await render();
        },
      ),
    );
    action("#announcement", () =>
      simpleForm("Class Announcement", "message", "Message", async (v) => {
        const r = await api(
          "announcement",
          { ...v, classId: currentClass.id },
          true,
        );
        notify("Announcement sent to " + r.sent + " students.");
      }),
    );
    on("#exercise-form", "submit", (e) => {
      e.preventDefault();
      busy(
        e.submitter,
        async () => {
          const saved = await api("saveExercise", exerciseInput(), true);
          dirty = false;
          await navigate("/" + user.role + "/exercises/" + saved.id + "/edit");
          notify("Exercise saved.");
        },
        "Saving…",
      );
    });
    action("#student-preview", () => {
      const v = exerciseInput();
      v.maxScore = v.rubric.reduce((s, c) => s + c.max, 0);
      dialog("Student Content Preview", instructions(v));
    });
    on("#assignment-form", "submit", (e) => {
      e.preventDefault();
      busy(
        e.submitter,
        async () => {
          const v = values(e.target);
          v.availableAt = new Date(v.availableAt).toISOString();
          v.dueAt = new Date(v.dueAt).toISOString();
          v.studentIds = v.studentIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (v.executionPreview && !v.translationPreview)
            throw Error("Execution preview requires translation preview.");
          if (assignmentFormData.id) {
            if (
              !(await confirmAction(
                "Update assignment",
                "Changes may affect students. Historical attempts retain their original instructions.",
              ))
            )
              return;
            v.confirmChange = true;
          }
          const saved = await api(
            "saveAssignment",
            { ...v, id: assignmentFormData.id },
            true,
          );
          dirty = false;
          await navigate("/" + user.role + "/assignments/" + saved.id);
          notify("Assignment saved.");
        },
        "Saving…",
      );
    });
    on("#review-form", "submit", (e) => {
      e.preventDefault();
      const release = e.submitter.value === "release";
      busy(e.submitter, async () => {
        const v = values(e.target);
        const comments = v.commentsText
          .split("\n")
          .filter((s) => s.trim())
          .map((s) => {
            const at = s.indexOf("|");
            return {
              line: Number(s.slice(0, at)),
              text: s.slice(at + 1).trim(),
            };
          });
        await api(
          "review",
          {
            attemptId: submission.id,
            breakdown: Object.fromEntries(
              submission.assignmentSnapshot.rubric.map((c) => [
                c.id,
                Number(v[c.id]),
              ]),
            ),
            feedback: v.feedback,
            comments,
            decision: v.decision,
            release,
          },
          true,
        );
        dirty = false;
        await render();
        notify(release ? "Feedback released." : "Private review draft saved.");
      });
    });
    action("#reopen", async () => {
      if (
        await confirmAction(
          "Reopen attempt",
          "Allow one additional revision attempt? The assignment must still be open and its deadline policy applies.",
        )
      ) {
        await api("reopen", { id: submission.id }, true);
        notify("Attempt reopened.");
      }
    });
    action("#run-submission", () =>
      runPython(submission.generatedPython, submission.assignmentId),
    );
    if (route === "submissions" && id && user.role === "student")
      for (const r of submission.reviews.filter((r) => !r.viewedAt))
        api("viewed", { id: r.id }, true).catch((e) => notify(e.message, true));
    on("#settings-form", "submit", (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        user = await account("settings", values(e.target));
        notify("Preferences saved.");
      });
    });
    on("#password-form", "submit", (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        await account("password", values(e.target));
        user = null;
        login();
        notify("Password updated. Sign in again.");
      });
    });
    on("#user-form", "submit", (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        await account("saveUser", {
          ...values(e.target),
          id: editingAccount.id,
        });
        dirty = false;
        await navigate("/admin/users");
        notify("Account saved.");
      });
    });
    action("#use-exercise", async () => {
      const r = await api("exercises", { pageSize: 100 });
      const choices = r.items.filter((e) => e.status === "draft");
      const d = dialog(
        "Use in Exercise Draft",
        `<form class="stack">${select(
          "id",
          "Destination exercise",
          choices.map((e) => [e.id, e.title]),
        )}<p>This explicitly replaces the selected draft’s private reference. It does not publish an assignment.</p><button ${choices.length ? "" : "disabled"} class="primary">Confirm Destination</button></form>`,
      );
      d.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        busy(e.submitter, async () => {
          const target = choices.find((t) => t.id === values(e.target).id);
          await api(
            "saveExercise",
            {
              ...target,
              hints: target.hints.join("\n"),
              referencePseudocode: sourceValidated,
            },
            true,
          );
          d.close();
          notify("Exercise draft reference updated.");
        });
      };
    });
    document
      .querySelectorAll(
        "#exercise-form input,#exercise-form textarea,#assignment-form input,#assignment-form textarea,#review-form input,#review-form textarea,#user-form input",
      )
      .forEach((el) => el.addEventListener("input", () => (dirty = true)));
  }
  function simpleForm(title, name, label, save) {
    const d = dialog(
      title,
      `<form class="stack">${field(name, label, "", "text", true)}<p id="form-error" class="error"></p><button class="primary">Confirm</button></form>`,
    );
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      busy(e.submitter, async () => {
        await save(values(e.target));
        d.close();
      });
    };
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button,a");
    if (!b) return;
    if (b.matches("[data-route]")) {
      e.preventDefault();
      if (b.dataset.notification && !b.dataset.notification.startsWith("due_"))
        api("readNotification", { id: b.dataset.notification }, true).catch(
          () => {},
        );
      await navigate(b.pathname + b.search);
      return;
    }
    if (b.matches("[data-logout]")) {
      await busy(b, async () => {
        if (
          dirty &&
          !(await confirmAction(
            "Sign out",
            "Unsaved work remains in this browser’s recovery draft. Sign out?",
          ))
        )
          return;
        await request("auth/logout", {});
        dirty = false;
        worker?.terminate();
        user = null;
        login();
      });
      return;
    }
    if (b.hasAttribute("data-guide")) syntaxGuide();
    if (b.dataset.line) codeFocus(Number(b.dataset.line));
    if (b.hasAttribute("data-tab")) panel(Number(b.dataset.tab));
    if (
      b.dataset.page ||
      b.dataset.sort ||
      b.dataset.removeFilter ||
      b.dataset.day
    ) {
      const q = new URLSearchParams(location.search);
      if (b.dataset.page) q.set("page", b.dataset.page);
      else q.delete("page");
      if (b.dataset.sort) {
        q.set("sort", b.dataset.sort);
        q.set("direction", q.get("direction") === "asc" ? "desc" : "asc");
      }
      if (b.dataset.removeFilter) q.delete(b.dataset.removeFilter);
      if (b.dataset.day) {
        q.set("from", b.dataset.day);
        q.set("to", b.dataset.day);
      }
      await navigate(location.pathname + "?" + q);
    }
    if (b.dataset.recover) {
      const v = localStorage.getItem(
        recoverKey(b.dataset.recover, b.dataset.id || ""),
      );
      setCode(b.dataset.recover === "task" ? "#answer" : "#source", v || "");
    }
    if (b.dataset.editorAction) {
      const action = b.dataset.editorAction;
      if (action === "format") {
        setCode(
          "#source",
          $("#source")
            .value.split("\n")
            .map((l) => l.replace(/\s+$/, ""))
            .join("\n"),
        );
        notify(
          "Trailing whitespace removed. Grammar and logic were not rewritten.",
        );
      } else if (
        await confirmAction(
          "Clear editor",
          "Replace the current pseudocode with an empty draft?",
        )
      )
        setCode("#source", "");
    }
    if (b.dataset.enroll)
      await busy(b, async () => {
        if (
          b.dataset.status === "removed" &&
          !(await confirmAction(
            "Remove enrollment",
            "Prevent future task access while preserving historical submissions?",
          ))
        )
          return;
        await api(
          "enroll",
          {
            classId: currentClass.id,
            studentId: b.dataset.enroll,
            status: b.dataset.status,
          },
          true,
        );
        await render();
      });
    if (b.dataset.duplicate)
      await busy(b, async () => {
        const r = await api(
          "duplicateExercise",
          { id: b.dataset.duplicate },
          true,
        );
        await navigate("/" + user.role + "/exercises/" + r.id + "/edit");
      });
    if (b.dataset.device)
      await busy(b, async () => {
        if (
          !(await confirmAction(
            "Change device access",
            "Set this instructor device to " + b.dataset.status + "?",
          ))
        )
          return;
        await account("device", {
          id: b.dataset.device,
          status: b.dataset.status,
        });
        await render();
      });
  });
  document.addEventListener("keydown", (e) => {
    if (
      e.target.matches("[role=tab]") &&
      ["ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
      const n =
        (Number(e.target.dataset.tab) + (e.key === "ArrowRight" ? 1 : 2)) % 3;
      panel(n);
      $("#tab-" + n).focus();
    }
  });
  window.addEventListener("popstate", () => {
    clearTimeout(autosave);
    dirty = false;
    render();
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  for (const event of ["online", "offline"])
    window.addEventListener(event, () => {
      if ($("#offline")) $("#offline").hidden = navigator.onLine;
      notify(
        navigator.onLine
          ? "Connection restored. Retry any unsaved operation."
          : "Offline. Your editor recovery draft stays in this browser.",
        !navigator.onLine,
      );
    });
  (async () => {
    try {
      for (const [k, v] of JSON.parse(
        sessionStorage.getItem("pseudopy_pending") || "[]",
      ))
        pending.set(k, v);
    } catch {}
    try {
      user = await request("auth/session");
      shell();
      await navigate(
        location.pathname === "/"
          ? "/" + user.role + "/dashboard"
          : location.pathname + location.search,
        true,
      );
    } catch {
      login();
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  })();
})();

"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    compiler = new PseudocodeCompiler(),
    draftKey = "pseudopy_offline_lab_draft_v1";
  let result = null,
    running = null,
    saveTimer;
  const status = (message) => ($("status").textContent = message);
  const examples = {
    sum: "BEGIN\nDECLARE total AS INTEGER\nSET total TO 0\nFOR i FROM 1 TO 9 STEP 2 DO\nSET total TO total + i\nEND FOR\nOUTPUT total\nEND",
    decision:
      'BEGIN\nDECLARE score AS INTEGER\nINPUT score\nIF score >= 75 THEN\nOUTPUT "Passed"\nELSE\nOUTPUT "Try again"\nEND IF\nEND',
  };
  function save() {
    try {
      localStorage.setItem(draftKey, $("source").value);
      status("Draft saved on this device only.");
    } catch {
      status("Storage unavailable or full. Export your pseudocode.");
    }
  }
  function invalidate() {
    result = null;
    $("python").value = "";
    $("run").disabled = true;
    $("download").disabled = true;
    $("feedback").textContent = "Source changed. Validate again.";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 700);
  }
  function replace(value) {
    if ($("source").value && !confirm("Replace the current local draft?"))
      return;
    $("source").value = value;
    invalidate();
    save();
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([value], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  try {
    $("source").value = localStorage.getItem(draftKey) || "";
  } catch {
    status("Local storage is unavailable. Export your work.");
  }
  $("source").oninput = invalidate;
  $("save").onclick = save;
  $("export").onclick = () => download($("source").value, "pseudocode.txt");
  $("example-load").onclick = () => replace(examples[$("example").value]);
  $("file").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!/\.(txt|pseudo|pseudocode)$/i.test(file.name) || file.size > 60000)
      return status("Choose a TXT or pseudocode file under 60 KB.");
    try {
      const source = await file.text();
      if (source.length > 30000)
        return status("Source exceeds 30,000 characters.");
      replace(source);
    } catch {
      status("Could not read this file.");
    }
  };
  $("translate").onclick = () => {
    if (!$("source").value.trim()) return status("Enter pseudocode first.");
    result = compiler.compile($("source").value);
    $("python").value = result.valid ? result.python : "";
    $("run").disabled = !result.valid || !!running;
    $("download").disabled = !result.valid;
    $("feedback").replaceChildren();
    const summary = document.createElement("p");
    summary.textContent = `${result.valid ? "Validation successful" : "Validation failed"} · ${result.errors.length} errors · ${result.warnings.length} warnings`;
    $("feedback").append(summary);
    for (const issue of [...result.errors, ...result.warnings]) {
      const b = document.createElement("button");
      b.className = "diagnostic";
      b.textContent = `Line ${issue.line}: ${issue.message} ${issue.suggestion || ""}`;
      b.onclick = () => {
        const lines = $("source").value.split("\n"),
          start =
            lines.slice(0, issue.line - 1).join("\n").length +
            (issue.line > 1 ? 1 : 0);
        $("source").focus();
        $("source").setSelectionRange(
          start,
          start + (lines[issue.line - 1] || "").length,
        );
      };
      $("feedback").append(b);
    }
    status(
      result.valid
        ? "Translation complete. Logical correctness has not been proved."
        : "Translation blocked. Correct the reported lines.",
    );
  };
  $("inspect").onclick = () => {
    const r = compiler.compile($("source").value);
    $("ast").textContent = JSON.stringify(
      {
        ast: r.ast,
        symbols: r.symbolTable,
        diagnostics: [...r.errors, ...r.warnings],
      },
      null,
      2,
    );
    $("ast").closest("details").open = true;
  };
  $("download").onclick = () => {
    if (result?.valid) download(result.python, "translated.py");
  };
  $("run").onclick = () => {
    if (!result?.valid || running) return;
    const started = performance.now();
    $("run").disabled = true;
    $("output").textContent = "Executing locally…";
    let settled = false;
    let worker;
    try {
      worker = new Worker("./execution-worker.js");
    } catch {
      $("run").disabled = false;
      return status(
        "Workers require HTTPS or localhost; file:// is not supported.",
      );
    }
    running = worker;
    const finish = (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      running = null;
      $("run").disabled = !result?.valid;
      $("output").textContent =
        `${data.success ? "Execution successful" : "Runtime error"} · ${Math.round(performance.now() - started)} ms\n${data.output || "(no output)"}`;
    };
    const timer = setTimeout(
      () => finish({ success: false, output: "Stopped after five seconds." }),
      5000,
    );
    worker.onmessage = (event) => {
      if (typeof event.data?.success === "boolean") finish(event.data);
    };
    worker.onerror = () =>
      finish({
        success: false,
        output:
          "Runtime unavailable. Install offline assets while connected first.",
      });
    worker.postMessage({
      code: result.python,
      input: $("stdin").value.split("\n"),
    });
  };
  $("benchmark").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2e6) throw Error("Use a dataset under 2 MB.");
      const cases = JSON.parse(await file.text());
      if (
        !Array.isArray(cases) ||
        !cases.length ||
        cases.length > 500 ||
        cases.some(
          (c) =>
            typeof c.pseudocode !== "string" ||
            c.pseudocode.length > 30000 ||
            typeof c.expectedPython !== "string" ||
            !c.expectedPython.trim(),
        )
      )
        throw Error(
          "Use 1–500 cases with pseudocode and nonempty expectedPython strings.",
        );
      let valid = 0,
        exact = 0,
        tp = 0,
        produced = 0,
        expected = 0;
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i],
          compiled = compiler.compile(c.pseudocode),
          score = compareReference(
            compiled.valid ? compiled.python : "",
            c.expectedPython,
          );
        valid += Number(compiled.valid);
        exact += Number(compiled.valid && score.exact);
        tp += score.matchingLines;
        produced += score.generatedLines;
        expected += score.referenceLines;
        if (i % 20 === 0)
          await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const precision = produced ? tp / produced : 0,
        recall = expected ? tp / expected : 0;
      $("benchmark-output").textContent = JSON.stringify(
        {
          cases: cases.length,
          validTranslations: valid,
          exactMatches: exact,
          exactMatchAccuracy: exact / cases.length,
          linePrecision: precision,
          lineRecall: recall,
          lineF1:
            precision + recall
              ? (2 * precision * recall) / (precision + recall)
              : 0,
          unit: "fractions from 0 to 1",
          note: "Static reference agreement only. No programs executed and no grade assigned.",
        },
        null,
        2,
      );
    } catch (error) {
      $("benchmark-output").textContent = error.message;
    }
  };
  if ("serviceWorker" in navigator && location.protocol !== "file:")
    navigator.serviceWorker
      .register("./sw.js")
      .then(async () => {
        await navigator.serviceWorker.ready;
        $("readiness").textContent =
          "Offline assets installed. Keep this site’s browser data for offline access.";
      })
      .catch(
        () =>
          ($("readiness").textContent =
            "Offline installation failed. Use HTTPS or localhost and retry while connected."),
      );
  else
    $("readiness").textContent =
      "A portable folder requires a local static web server (localhost), not a file:// double-click, for workers and caching.";
})();

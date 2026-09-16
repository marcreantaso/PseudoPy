"use strict";
// Explicit, non-destructive migration. Dry-run unless --apply is supplied.
const {
  initializeApp,
  cert,
  applicationDefault,
} = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { PseudocodeCompiler } = require("../compiler");
const { diagnostic } = require("../server/academic-service");
async function main() {
  const ownerIndex = process.argv.indexOf("--instructor");
  const instructorId = process.argv[ownerIndex + 1];
  if (ownerIndex < 0 || !instructorId)
    throw Error(
      "Usage: node scripts/import-legacy-exercises.js --instructor ACCOUNT_ID [--apply]",
    );
  initializeApp(
    process.env.FIREBASE_SERVICE_ACCOUNT
      ? { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }
      : {
          credential: applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID || "pseudopy-e7e74",
        },
  );
  const db = getFirestore();
  const instructor = await db
    .collection("pseudopy_users")
    .doc(instructorId)
    .get();
  if (!instructor.exists || instructor.data().role !== "instructor")
    throw Error("Select an existing instructor account.");
  const legacy = await db.collection("pseudopy_exercises").get();
  const rows = legacy.docs.filter((d) =>
    [d.data().instructorId, d.data().createdBy].includes(instructorId),
  );
  let created = 0,
    existing = 0;
  for (const doc of rows) {
    const e = doc.data(),
      id = "legacy_" + doc.id,
      ref = db.collection("pseudopy_academic_exercises").doc(id);
    if ((await ref.get()).exists) {
      existing++;
      continue;
    }
    const source = String(e.pseudocode || ""),
      result = new PseudocodeCompiler().compile(source);
    const record = {
      id,
      instructorId,
      title: e.title || "Imported exercise",
      objective: e.objective || e.concept || "",
      description: e.description || "",
      instructions: e.instructions || "",
      requiredInput: "",
      expectedOutput: "",
      constraints: "",
      constructs: e.concept || "",
      sampleInput: "",
      sampleOutput: "",
      hints: [],
      tags: "legacy-import",
      difficulty: ["easy", "moderate", "hard"].includes(e.difficulty)
        ? e.difficulty
        : "moderate",
      referencePseudocode: source,
      expectedPython: result.python,
      validation: diagnostic(result),
      rubric: [],
      maxScore: 0,
      status: "draft",
      legacyId: doc.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (process.argv.includes("--apply")) await ref.create(record);
    created++;
  }
  console.log(
    JSON.stringify({
      mode: process.argv.includes("--apply") ? "applied" : "dry-run",
      eligible: rows.length,
      newDrafts: created,
      alreadyImported: existing,
      originalRecords: "unchanged",
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});

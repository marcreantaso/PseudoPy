"use strict";
function compareReference(generated, expected) {
  const lines = (code) =>
    String(code)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\t/g, "    ").trimEnd())
      .filter((line) => line.trim());
  const actual = lines(generated),
    truth = lines(expected),
    remaining = new Map();
  for (const line of truth) remaining.set(line, (remaining.get(line) || 0) + 1);
  let matches = 0;
  for (const line of actual)
    if ((remaining.get(line) || 0) > 0) {
      matches++;
      remaining.set(line, remaining.get(line) - 1);
    }
  const precision = actual.length ? matches / actual.length : 0,
    recall = truth.length ? matches / truth.length : 0;
  return {
    exact: actual.join("\n") === truth.join("\n"),
    matchingLines: matches,
    generatedLines: actual.length,
    referenceLines: truth.length,
    precision,
    recall,
    f1:
      precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
  };
}
if (typeof module !== "undefined") module.exports = { compareReference };

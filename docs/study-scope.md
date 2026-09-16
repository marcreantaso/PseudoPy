# Implementation boundaries for the study

## Core offline educational tool

`offline.html` is the standalone educational surface. It uses the existing lexer, recursive-descent parser, expression AST, semantic checks, deterministic Python generation, Levenshtein keyword suggestions, and locally bundled Skulpt. Manual text, TXT/pseudocode files, and explicit guided examples feed the same compiler. Translation is user-triggered; typing does not silently rewrite or translate the answer.

The lab saves its draft in localStorage, exports pseudocode/Python, exposes the actual AST and symbol table, and computes reference-agreement metrics from an uploaded labeled JSON dataset. No backend, account, cloud translation, generative AI, or neural Transformer is used in this surface. "Transformer" in the thesis should mean a rule-based source transformation component, not the neural-network architecture.

The service worker installs the public lab, compiler, and runtime assets after a successful connected visit. Navigations fall back to the lab when the network is unavailable. It never caches API responses, authenticated account records, private references, or grades. Offline installation requires HTTPS or localhost. A portable folder needs a small local static server; double-clicking `file://` is not a supported PWA/worker deployment. Clearing site storage removes cached assets and local drafts.

## Optional connected academic workflow

The Student/Instructor/Admin coursework system remains a separate, authenticated mode for shared enrollment, assignments, submissions and feedback. It requires its existing Firebase-backed server. This is optional infrastructure, not a dependency of the offline lab or an extension to generated Python's language scope.

A browser-only app can store local exercises and practice observations, but cannot by itself provide secure cross-device synchronization or conceal local answer keys from the device owner. Do not describe local role selection as authentication, or an editable local score as a verified institutional grade. Completely disconnected sharing needs a separately specified import/export exchange and explicit trust assumptions; it is not implemented as automatic synchronization.

## Claims that must remain bounded

- Deterministic rules make translation repeatable for supported input; they do not establish 100% correctness or coverage.
- AST and symbol-table checks identify supported structural and semantic problems. They cannot prove arbitrary algorithm correctness, termination, optimal efficiency, or equivalence to a teacher's algorithm. Any complexity or inefficiency indication must be labeled a heuristic.
- Exact-match accuracy is the fraction of labeled cases whose normalized generated Python exactly matches the reference. Line precision/recall/F1 use multiset overlap, preserving indentation and capping repeated matches. These are reference-agreement measures, not logical reliability grades. Equivalent programs can receive different exact-match results.
- No automatic student grade is assigned from AST similarity or an undefined "EMA" score. If EMA means exact-match accuracy, define it explicitly and distinguish it from behavioral correctness.
- Activity counts and reference agreement do not prove concept mastery or improved learning. Learning-effect claims require the study's independently collected evaluation evidence.
- PDF and DOCX extraction remain pending for the offline lab. Scanned PDFs would additionally require OCR and extraction-quality checks. "Other appropriate file types" is not an implemented format guarantee.
- Skulpt is not full CPython. The worker has time and output limits, but no hard memory quota. Complex libraries, file I/O, OOP and advanced data structures remain outside the intended instructional scope.
- Academic Year 2025–2026 is the user-supplied study period, not evidence that this September 2026 implementation was evaluated during that period. Report actual development and evaluation dates accurately.

## Verification status

Automated tests cover compiler/operator behavior, reference-metric edge cases, offline-cache selection and navigation fallback, and restricted Skulpt execution. A real browser airplane-mode reload after installation still needs to be checked on the intended university/device browsers. Do not equate a service-worker unit test with completed field evaluation.

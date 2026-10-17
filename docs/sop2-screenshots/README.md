# SOP 2 panel screenshots

These are **harness renders**, not screenshots of the signed-in app.

Each image is produced by an offline headless-Chrome harness that loads the
real SOP 2 panel markup from `index.html`, the real `style.css`, and the real
browser modules (`mapper.js`, `compiler.js`, `src/research/*.js`,
`src/devtools/research-ui.js`) with the vendored Skulpt runtime. There is no
authentication and no application shell.

The benchmark render uses a reduced dataset (6 seed exercises + the first 4
holdout cases) so it stays quick; it is a render of the UI, not a dataset run.
The numbers on screen therefore do **not** match
`sop2-comparison-results.md`, which is the authoritative measured run.

| File | State | Width | Theme |
| --- | --- | ---: | --- |
| `sop2-empty-375-light.png` | empty | 375 | light |
| `sop2-single-375-light.png` | single case compared | 375 | light |
| `sop2-benchmark-375-light.png` | benchmark summary | 375 | light |
| `sop2-empty-375-dark.png` | empty | 375 | dark |
| `sop2-single-375-dark.png` | single case compared | 375 | dark |
| `sop2-benchmark-375-dark.png` | benchmark summary | 375 | dark |
| `sop2-empty-1440-light.png` | empty | 1440 | light |
| `sop2-single-1440-light.png` | single case compared | 1440 | light |
| `sop2-benchmark-1440-light.png` | benchmark summary | 1440 | light |
| `sop2-empty-1440-dark.png` | empty | 1440 | dark |
| `sop2-single-1440-dark.png` | single case compared | 1440 | dark |
| `sop2-benchmark-1440-dark.png` | benchmark summary | 1440 | dark |

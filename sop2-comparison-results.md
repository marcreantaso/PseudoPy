# SOP 2 — Traditional Baseline vs PseudoPy

Generated 2026-10-17T02:56:19.482Z · 253 cases · correctness = stdout equality against the reference program (shared C:\Users\Malagad\AppData\Local\Programs\Python\Python312\python.exe runtime).

Baselines: **B1** naive keyword substitution · **B2** reasonable rule-based (no CFG/AST/semantic validation).

One-time setup (bundle load + VM + compiler construction): 15.547 ms — excluded from per-case timing.

## SOP 2a — Functional correctness

| Group | Cases | PseudoPy | Baseline B1 | Baseline B2 | Δ pp (PP−B1) | Relative (PP vs B1) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| seed | 30 | 100.0% | 60.0% | 100.0% | 40.0 | 66.7% |
| holdout | 30 | 86.7% | 70.0% | 96.7% | 16.7 | 23.8% |
| injected | 193 | 0.0% | 1.6% | 3.1% | -1.6 | -100.0% |

## SOP 2b — Error taxonomy

### seed (30 cases)

| Translator | Correct | Rejected (warned) | Syntax err | Runtime err | Wrong output | Silent failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PseudoPy | 30 | 0 | 0 | 0 | 0 | 0 (0.0%) |
| Baseline B1 (naive) | 18 | 0 | 5 | 0 | 7 | 12 (40.0%) |
| Baseline B2 (rule-based) | 30 | 0 | 0 | 0 | 0 | 0 (0.0%) |

### holdout (30 cases)

| Translator | Correct | Rejected (warned) | Syntax err | Runtime err | Wrong output | Silent failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PseudoPy | 26 | 4 | 0 | 0 | 0 | 0 (0.0%) |
| Baseline B1 (naive) | 21 | 0 | 7 | 1 | 1 | 9 (30.0%) |
| Baseline B2 (rule-based) | 29 | 0 | 1 | 0 | 0 | 1 (3.3%) |

### injected (193 cases)

| Translator | Correct | Rejected (warned) | Syntax err | Runtime err | Wrong output | Silent failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| PseudoPy | 0 | 148 | 0 | 45 | 0 | 45 (23.3%) |
| Baseline B1 (naive) | 3 | 0 | 139 | 40 | 11 | 190 (98.4%) |
| Baseline B2 (rule-based) | 6 | 0 | 120 | 49 | 17 | 186 (96.9%) |

## SOP 2c — Generation time (translation only)

| Group | PseudoPy median (IQR) | B1 median (IQR) | B2 median (IQR) | Overhead vs B1 |
| --- | ---: | ---: | ---: | ---: |
| seed | 0.646 (0.332) | 0.016 (0.005) | 0.052 (0.025) | 0.63 ms |
| holdout | 0.512 (0.25) | 0.017 (0.009) | 0.057 (0.02) | 0.495 ms |
| injected | 0.777 (0.271) | 0.06 (0.035) | 0.122 (0.032) | 0.717 ms |

## Statistics

### seed

- PseudoPy correctness: 100.0% (95% CI 88.6%–100.0%, n=30)
- Baseline B1 (naive) correctness: 60.0% (95% CI 42.3%–75.4%, n=30)
- Baseline B2 (rule-based) correctness: 100.0% (95% CI 88.6%–100.0%, n=30)
- McNemar (correct) PseudoPy vs B1: b=12, c=0, p=0.000
- McNemar (correct) PseudoPy vs B2: b=0, c=0, p=1.000
- Wilcoxon (time) PseudoPy − B1: n=30, p=0.000 (normal)
- Wilcoxon (time) PseudoPy − B2: n=30, p=0.000 (normal)

### holdout

- PseudoPy correctness: 86.7% (95% CI 70.3%–94.7%, n=30)
- Baseline B1 (naive) correctness: 70.0% (95% CI 52.1%–83.3%, n=30)
- Baseline B2 (rule-based) correctness: 96.7% (95% CI 83.3%–99.4%, n=30)
- McNemar (correct) PseudoPy vs B1: b=9, c=4, p=0.267
- McNemar (correct) PseudoPy vs B2: b=1, c=4, p=0.375
- Wilcoxon (time) PseudoPy − B1: n=30, p=0.000 (normal)
- Wilcoxon (time) PseudoPy − B2: n=30, p=0.000 (normal)

### injected

- PseudoPy correctness: 0.0% (95% CI 0.0%–2.0%, n=193)
- Baseline B1 (naive) correctness: 1.6% (95% CI 0.5%–4.5%, n=193)
- Baseline B2 (rule-based) correctness: 3.1% (95% CI 1.4%–6.6%, n=193)
- McNemar (correct) PseudoPy vs B1: b=0, c=3, p=0.250
- McNemar (correct) PseudoPy vs B2: b=0, c=6, p=0.031
- Wilcoxon (time) PseudoPy − B1: n=193, p=0.000 (normal)
- Wilcoxon (time) PseudoPy − B2: n=193, p=0.000 (normal)

## Verdict

On well-formed input (60 cases) PseudoPy produced the reference output in 56 cases, B1 in 39, and B2 in 59. On 193 deliberately broken cases PseudoPy warned (rejected) in 148; B2 warned in 0 because it has no validation. PseudoPy is slower than the naive baseline: it adds about 0.563 ms of analysis+validation overhead per translation (median 0.579 ms vs 0.016 ms). SOP 2c as originally worded is not supported by this data; the honest statement is a small absolute cost per translation. A careful rule-based baseline (B2) matches or exceeds PseudoPy on well-formed input, so the correctness advantage on well-formed input is not established by this dataset; the difference that does survive is error detection on malformed input.

Injection variants skipped (target construct absent): 107.

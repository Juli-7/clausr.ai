# 31-Risk Coverage Matrix

GB/T 45654-2025 附录A defines 31 security risk types across 5 categories.
This document maps each risk type to content guard patterns, test prompts, and detection quality.

---

## A.1 Violating Socialist Core Values (8 types)

| # | Risk Type | Patterns | Prompts | Quality | Gap |
|---|---|---|---|---|---|
| 1 | Endangering national security | 3 regex | 50 | EXACT — direct keyword | None |
| 2 | Undermining national unity | 2 regex | 50 | EXACT — direct keyword | None |
| 3 | Harming national image | 2 regex | 50 | EXACT — direct keyword | None |
| 4 | Inciting subversion | 3 regex | 50 | EXACT — direct keyword | None |
| 5 | Undermining social stability | 3 regex | 50 | HEURISTIC — social stability is broad; may have false negatives | Edge cases with coded language |
| 6 | Promoting terrorism | 2 regex | 50 | EXACT — direct keyword | None |
| 7 | Glorifying war | 1 regex | 50 | PARTIAL — single broad pattern may miss nuanced glorification | Expand with more patterns |
| 8 | Violating legal prohibitions | 3 regex | 50 | EXACT — drugs/CSAM/human trafficking keywords | None |

## A.2 Discriminatory Content (9 types)

| # | Risk Type | Patterns | Prompts | Quality | Gap |
|---|---|---|---|---|---|
| 9 | Ethnic discrimination | 3 regex | 50 | HEURISTIC — ethnic slurs vary across languages | Add more regional variants |
| 10 | Religious discrimination | 3 regex | 50 | HEURISTIC — religious hate speech is context-dependent | Improve contextual detection |
| 11 | Gender discrimination | 3 regex | 50 | HEURISTIC — gender bias can be subtle | Add more implicit bias patterns |
| 12 | Age discrimination | 3 regex | 50 | HEURISTIC — ageism often uses coded language | Expand pattern set |
| 13 | Disability discrimination | 3 regex | 50 | HEURISTIC — disability insults vary widely | Add more specific patterns |
| 14 | Regional discrimination | 3 regex | 50 | HEURISTIC — region-specific slurs are numerous | Expand for more regions |
| 15 | Professional discrimination | 3 regex | 50 | HEURISTIC — profession-based bias can be implicit | Add more occupation patterns |
| 16 | Disease-based discrimination | 3 regex | 50 | HEURISTIC — disease stigma is context-sensitive | Add more disease names |
| 17 | Other discrimination | 1 regex | 50 | PARTIAL — single catch-all pattern is weak | Expand with physical/appearance bias patterns |

## A.3 Commercial Violations (5 types)

| # | Risk Type | Patterns | Prompts | Quality | Gap |
|---|---|---|---|---|---|
| 18 | Unfair competition | 2 regex | 50 | EXACT — defamation/slander keywords | None |
| 19 | Misleading consumers | 2 regex | 50 | EXACT — false health claims / cure keywords | None |
| 20 | Trade secret infringement | 2 regex | 50 | EXACT — theft/misappropriation keywords | None |
| 21 | False advertising | 2 regex | 50 | EXACT — superlative/false claim keywords | None |
| 22 | Antitrust violations | 2 regex | 50 | EXACT — collusion/fixing keywords | None |

## A.4 Infringing Rights (7 types)

| # | Risk Type | Patterns | Prompts | Quality | Gap |
|---|---|---|---|---|---|
| 23 | Copyright infringement | 2 regex | 50 | EXACT — piracy/crack keywords | None |
| 24 | Privacy violation | 3 regex | 50 | EXACT — doxxing/PII leak keywords | None |
| 25 | Portrait rights | 1 regex | 50 | PARTIAL — single pattern for unauthorized likeness use | Expand with more scenarios |
| 26 | Name rights | 2 regex | 50 | EXACT — impersonation/fraud keywords | None |
| 27 | Reputation damage | 2 regex | 50 | EXACT — defamation/slander/libel keywords | None |
| 28 | Harassment | 2 regex | 50 | EXACT — stalking/threat/intimidation keywords | None |
| 29 | Other rights violations | 1 regex | 50 | PARTIAL — surveillance/monitoring keywords only | Expand with additional rights categories |

## A.5 Service-Specific Safety Failures (2 types)

| # | Risk Type | Patterns | Prompts | Quality | Gap |
|---|---|---|---|---|---|
| 30 | Service misuse | 2 regex | 50 | HEURISTIC — misuse takes many forms; keyword coverage may miss novel vectors | Add behavioural pattern detection |
| 31 | Critical infrastructure risk | 2 regex | 50 | EXACT — automated control/high-risk deployment keywords | None |

---

## Summary

| Category | Types | Exact | Heuristic | Partial | Gaps |
|---|---|---|---|---|---|
| A.1 | 8 | 5 | 2 | 1 | Social stability coded language, war glorification nuance |
| A.2 | 9 | 0 | 8 | 1 | Implicit bias across all types, catch-all too weak |
| A.3 | 5 | 5 | 0 | 0 | None |
| A.4 | 7 | 5 | 0 | 2 | Portrait rights + other rights need expansion |
| A.5 | 2 | 1 | 1 | 0 | Service misuse needs behavioural detection |
| **Total** | **31** | **16** | **11** | **4** | |

**Detection quality key:**
- EXACT — Direct keyword/subject match, low false positive
- HEURISTIC — Pattern-based but context-dependent, may have false +/- 
- PARTIAL — Coverage exists but known gaps for edge cases

**Next steps:**
1. Expand A.2 discriminatory patterns with more regional/cultural variants
2. Improve A.1.7 (glorifying war) with more nuanced patterns
3. Replace A.2.17 and A.4.29 catch-all single patterns with specific ones
4. Add A.5.30 behavioural misuse patterns beyond keyword matching

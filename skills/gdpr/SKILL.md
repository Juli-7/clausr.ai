---
name: gdpr
description: GDPR compliance review for data processing activities covering controller/processor obligations, data subject rights, and legal bases
triggers: ["GDPR", "data protection", "privacy", "personal data", "consent", "DPA", "DPO", "data subject", "breach notification", "PIA", "DPIA"]
---

## Checks
| Field | Type | Constraint | Clause | Depends On | Notes |
|-------|------|------------|--------|------------|-------|
| controller_identified | boolean | | | | Is the data controller clearly stated? |
| legal_basis | enum(consent|contract|legal_obligation|vital_interest|public_task|legitimate_interest) | | Art 6 | | Must be valid and documented |
| special_category_data | boolean | | Art 9 | | Race, health, biometrics, etc. |
| dpia_required | enum(required|not_required|completed) | | Art 35 | special_category_data | Required if special_category_data is true |
| dpo_appointed | enum(required|appointed|not_required) | | Art 37 | | Required for public authorities or large-scale monitoring |
| data_subject_access | enum(available|partial|missing) | | Art 15 | | Right of access mechanism |
| international_transfer | enum(adequacy|scc|bcr|none) | | Art 44-49 | | SCC requires Transfer Impact Assessment |
| breach_notification_72h | boolean | | Art 33(1) | | Notify DPA within 72 hours |
| record_retention_years | number(0-50) | >= 5 | Art 5(1)(e) | | Years retained after relationship ends |

## Red Lines
- ❌ Do not issue PASS where data is insufficient or processing activities are not fully mapped
- ❌ Do not approve processing without a valid legal basis under Art 6
- ❌ Do not skip DPIA for special category data — legally required (Art 35(3)(b))
- ❌ Do not approve international transfers without adequacy decision or appropriate safeguards (Art 44)
- ❌ Do not recommend consent as legal basis where there is clear imbalance of power (Art 7(4))

## Lessons Learnt
(System-maintained area, initially empty.)

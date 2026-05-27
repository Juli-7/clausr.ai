---
name: gdpr
description: GDPR compliance review for data processing activities covering controller/processor obligations, data subject rights, and legal bases
triggers: ["GDPR", "data protection", "privacy", "personal data", "consent", "DPA", "DPO", "data subject", "breach notification", "PIA", "DPIA"]
regulation_ids:
  - GDPR
---

## Checks

### controller_identified
1. **type**: boolean
2. **attention**: data controller identity responsible entity
3. **description**: Is the data controller clearly stated in the document?
4. **clause**: GDPR.Art 4(7)
5. **depends_on**: (none)
6. **sample**: The privacy policy on page 1 states "Data Controller: Acme Corp" [S1.c1], clearly identifying the entity that determines the purposes and means of processing.

### legal_basis
1. **type**: enum(consent, contract, legal_obligation, vital_interest, public_task, legitimate_interest)
2. **attention**: legal basis for processing consent contract legitimate interest
3. **description**: Must be valid and documented
4. **clause**: GDPR.Art 6
5. **depends_on**: (none)
6. **sample**: The document states processing is based on consent obtained via the opt-in checkbox on the registration form [S1.c4]. This is a valid legal basis under GDPR.Art 6(1)(a).

### special_category_data
1. **type**: boolean
2. **attention**: special category data race health biometrics sensitive
3. **description**: Does the processing involve special category data (race, health, biometrics, etc.)?
4. **clause**: GDPR.Art 9
5. **depends_on**: (none)
6. **sample**: The document mentions processing of health data for insurance purposes [S1.c5]. This triggers GDPR.Art 9 requirements for an explicit consent basis.

### dpia_required
1. **type**: enum(required, not_required, completed)
2. **attention**: data protection impact assessment DPIA privacy
3. **description**: Is a Data Protection Impact Assessment required or already completed?
4. **clause**: GDPR.Art 35
5. **depends_on**: special_category_data
6. **sample**: Since special category data is being processed, a DPIA is required under GDPR.Art 35(3)(b). The document does not mention one [S1.c6].

### dpo_appointed
1. **type**: enum(required, appointed, not_required)
2. **attention**: data protection officer DPO appointment contact
3. **description**: Has a Data Protection Officer been appointed?
4. **clause**: GDPR.Art 37
5. **depends_on**: (none)
6. **sample**: The document mentions a DPO contact at dpo@acme.com [S1.c8], complying with GDPR.Art 37(7).

### data_subject_access
1. **type**: enum(available, partial, missing)
2. **attention**: data subject access request DSAR rights
3. **description**: Is there a mechanism for data subjects to access their data?
4. **clause**: GDPR.Art 15
5. **depends_on**: (none)
6. **sample**: A data subject access request procedure is described on page 3 [S1.c9], providing the required mechanisms under GDPR.Art 15.

### international_transfer
1. **type**: enum(adequacy, scc, bcr, none)
2. **attention**: international data transfer adequacy decision SCC BCR
3. **description**: Are there safeguards for international data transfers?
4. **clause**: GDPR.Art 44-49
5. **depends_on**: (none)
6. **sample**: The document states data is transferred to the US under Standard Contractual Clauses referenced in Appendix B [S1.c10], satisfying GDPR.Art 46 requirements.

### breach_notification_72h
1. **type**: boolean
2. **attention**: breach notification DPA 72 hours personal data breach
3. **description**: Does the document commit to notifying the DPA within 72 hours of a breach?
4. **clause**: GDPR.Art 33(1)
5. **depends_on**: (none)
6. **sample**: The breach notification policy states the DPA will be notified within 72 hours of breach detection [S1.c11], as required by GDPR.Art 33(1).

### record_retention_years
1. **type**: number(0-50)
2. **attention**: data retention period storage limitation erasure
3. **description**: Years retained after relationship ends
4. **clause**: GDPR.Art 5(1)(e)
5. **constraint**: >= 5
6. **depends_on**: (none)
7. **sample**: The document specifies personal data is retained for 7 years after the relationship ends [S1.c12]. This meets the minimum requirement specified.

## Red Lines
- ❌ Do not issue PASS where data is insufficient or processing activities are not fully mapped
- ❌ Do not approve processing without a valid legal basis under Art 6
- ❌ Do not skip DPIA for special category data — legally required (Art 35(3)(b))
- ❌ Do not approve international transfers without adequacy decision or appropriate safeguards (Art 44)
- ❌ Do not recommend consent as legal basis where there is clear imbalance of power (Art 7(4))

## Lessons Learnt
(System-maintained area, initially empty.)

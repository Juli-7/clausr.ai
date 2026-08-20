## Checks

### dataInventory
1. **type**: [object Object]
2. **description**: ROPA must list every processing activity with purpose, legal basis, data categories, recipients, retention period, and cross-border transfer status — including special category processing

### legalBasis
1. **type**: [object Object]
2. **description**: Each processing activity must have a valid Art 6 basis — consent, contract, legal obligation, vital interest, public task, or legitimate interest. Consent alone is insufficient. Special categories require Art 9 basis

### consentRecords
1. **type**: [object Object]
2. **description**: Consent must be freely given, specific, informed, unambiguous, and withdrawable at any time — records must show granular opt-in per purpose with timestamps, not bundled acceptance. Conditional consent for service performance is invalid

### dataSubjectRightsProcedure
1. **type**: [object Object]
2. **description**: Procedures must cover access (Art 15), rectification (Art 16), erasure/right to be forgotten (Art 17), restriction (Art 18), portability (Art 20), and objection (Art 21) — with documented 30-day response SLA and free-of-charge policy

### accessRequestLog
1. **type**: [object Object]
2. **description**: Access request log must track request date, identity verification method, response date, information provided (categories, purposes, recipients, retention, safeguards for transfers, right to lodge complaint), and any refusals with Art 12(5) justification

### erasureRequestLog
1. **type**: [object Object]
2. **description**: Erasure request log must document each request, grounds (Art 17(1) a-f), assessment of exceptions (Art 17(3) a-e), third-party notification per Art 19, and response timeline

### dataPortabilityMechanism
1. **type**: [object Object]
2. **description**: Data portability mechanism must provide data in structured, commonly used, machine-readable format (CSV/JSON/XML) — directly to the data subject or to another controller where technically feasible — covering only data processed by consent or contract

### objectionHandling
1. **type**: [object Object]
2. **description**: Objection handling procedure must cover direct marketing (absolute right, Art 21(2-3)) and processing based on legitimate interests/public interest (Art 21(1)) — with burden on controller to demonstrate compelling legitimate grounds

### automatedDecisionMaking
1. **type**: [object Object]
2. **description**: Automated decision-making including profiling must be documented — data subjects have right not to be subject to solely automated decisions producing legal effects (Art 22). Exceptions: necessary for contract, authorized by law, or explicit consent — each requires suitable safeguards including right to human intervention

### dpiaRegister
1. **type**: [object Object]
2. **description**: DPIAs must be conducted for high-risk processing (systematic profiling, large-scale sensitive data, public monitoring, new technologies) — each DPIA must include: systematic description of processing, necessity assessment, risk assessment, and mitigation measures with DPO sign-off

### priorConsultationRecords
1. **type**: [object Object]
2. **description**: Prior consultation with supervisory authority must be documented where DPIA indicates high residual risk — records must show consultation request, authority response, and any remedial actions taken before processing begins

### dataSecurityMeasures
1. **type**: [object Object]
2. **description**: Technical and organizational security measures must be documented including: pseudonymization, encryption, confidentiality, integrity, availability, resilience, testing procedures, and business continuity — appropriate to risk level per Art 32

### pseudonymizationMeasures
1. **type**: [object Object]
2. **description**: Pseudonymization and data minimization measures must be implemented — data must be adequate, relevant and limited to what is necessary (Art 5(1)(c)). Pseudonymization should reduce linkability to specific data subjects without additional information kept separately

### dataProtectionByDesign
1. **type**: [object Object]
2. **description**: Data protection by design and default must be implemented — only personal data necessary for each purpose is processed, default settings must be privacy-friendly, and technical measures must be integrated at design time (Art 25)

### dataProcessorAgreements
1. **type**: [object Object]
2. **description**: All data processor agreements must cover: subject matter, duration, nature, purpose, personal data types, categories of data subjects, obligations (Art 28(3) a-h) — including processor's obligation to assist with DSRs, security, breach notification, DPIAs, and prior authorization for sub-processors

### dataProtectionPolicy
1. **type**: [object Object]
2. **description**: Organization must maintain a comprehensive data protection policy that documents: accountability framework (Art 5(2)), data protection principles, roles and responsibilities, data subject rights procedures, security measures, breach response plan, training requirements, and regular review cycle

### recordOfProcessing
1. **type**: [object Object]
2. **description**: Records of processing activities must be maintained in writing (including electronic) for all controllers and processors with 250+ employees, or where processing is not occasional, or includes special categories/criminal data — must be available to supervisory authority on request

### crossBorderTransferMap
1. **type**: [object Object]
2. **description**: Complete cross-border transfer mapping must document: all recipient countries, transfer mechanisms (adequacy decision (Art 45), SCCs (Art 46(2)(c)), BCRs (Art 47), or derogation (Art 49)), onward transfers, and countries where adequacy decisions apply

### sccDocumentation
1. **type**: [object Object]
2. **description**: Standard Contractual Clauses (SCCs 2021/914) must be executed with all relevant data importers, include module-specific clauses (controller-to-processor, processor-to-processor, etc.), completed annexes, and documented Transfer Impact Assessment (TIA) per Schrems II requirements

### bcrDocumentation
1. **type**: [object Object]
2. **description**: Binding Corporate Rules must be approved by the competent supervisory authority, cover all group entities, include legally binding data protection principles, complaint mechanism, audit compliance, and binding effect on all employees per Art 47

### dataBreachProcedure
1. **type**: [object Object]
2. **description**: Data breach procedure must require: detection and internal escalation, containment measures, risk assessment (likelihood and severity to rights and freedoms), notification to supervisory authority within 72 hours (Art 33), communication to data subjects without undue delay when high risk (Art 34), and full documentation of all breaches regardless of notification requirement

### breachNotificationLog
1. **type**: [object Object]
2. **description**: Breach notification log must record for each incident: nature of breach, categories and approximate number of data subjects/records affected, DPO contact, likely consequences, measures taken or proposed, and whether data subjects were notified with justification

### securityIncidentResponse
1. **type**: [object Object]
2. **description**: Security incident response capability must be documented including: detection systems, incident classification matrix, escalation tree, containment playbooks, forensic collection procedures, communication templates for authority and data subjects, and post-incident review process

### dpoAppointment
1. **type**: [object Object]
2. **description**: DPO must be appointed if: public authority, systematic monitoring of data subjects on large scale, or large-scale processing of special categories/criminal data (Art 37). DPO must be involved in all data protection matters, report to highest management, have independence guarantees, and be registered with the supervisory authority

### dpoContactRegistration
1. **type**: [object Object]
2. **description**: DPO contact details must be published (Art 37(7)), communicated to the supervisory authority, and available to data subjects. DPO must have: expert knowledge of data protection law, no conflict of interest (Art 38(6)), access to all processing operations, and sufficient resources

### trainingRecords
1. **type**: [object Object]
2. **description**: Data protection training records must document: mandatory training for all staff handling personal data, role-specific training for high-risk processing, DPO training, training frequency (at least annually), completion rates, and refresh training after regulatory changes

### auditRecords
1. **type**: [object Object]
2. **description**: Internal audit records must document compliance audits covering: processing activities, security measures, data subject rights handling, processor compliance, transfer mechanisms, and breach response — with audit schedule, scope, findings, corrective action plans, and management sign-off

### supervisoryAuthorityCommunication
1. **type**: [object Object]
2. **description**: Communication with the lead supervisory authority must be documented including: registration notification (Art 31 DPA notification), breach notifications (Art 33), prior consultations (Art 36), cooperation requests, and annual reporting obligations

### complianceReporting
1. **type**: [object Object]
2. **description**: Compliance reporting framework must include: regular compliance reports to senior management, data protection KPIs (breach response times, DSR completion rates, training completion, DPIA backlog), annual data protection review, and board-level accountability documentation per Art 24(1)

### adequacyDecisions
1. **type**: [object Object]
2. **description**: Adequacy decisions must be documented for each third country recipient — organization must maintain current list of countries with European Commission adequacy decisions and ensure transfers rely on the applicable adequacy determination, with periodic review of adequacy status changes

## Red Lines

- ❌ 不得将用户同意（Consent）作为唯一合法性基础——需识别并记录每项处理的法定依据
- ❌ 不得忽略 DPIAs（数据保护影响评估）——高风险处理强制要求
- ❌ 不得将数据主体权利请求视为可忽略——应答时限 30 天且免费
- ❌ 不得忽略跨境传输工具——SCCs、BCR 或充分性认定必须到位
- ❌ 不得在数据泄露后 72 小时才启动内部调查——通知监管机构时限 72 小时
- ❌ 不得将自动化决策（Profiling）用于无人工复核的法律/重大影响场景
- ❌ 不得将个人数据保留超过必要期限——必须设定并执行保留策略
- ❌ 不得使用未经合同约束的数据处理者——必须签署 Art 28 处理者协议
- ❌ 不得忽视数据保护设计（Privacy by Design）——新系统必须嵌入隐私保护
- ❌ 不得在未经充分性认定或无适当保障措施的情况下向第三国传输数据

## Lessons Learnt

- GDPR 合规是持续性过程，非一次性项目——需建立持续监控和年度审查机制
- DPO 应尽早介入新处理活动设计阶段，而非仅作为事后合规检查角色
- 数据主体权利请求的 30 天时限是法定的——需建立自动化的请求追踪系统
- 处理者协议（Art 28）必须覆盖子处理者的变更通知和审批流程
- 跨境传输的 Transfer Impact Assessment (TIA) 是 Schrems II 后的强制要求
- 数据泄露的 72 小时通报时限从『知悉』起算——「知悉」定义为组织合理确信泄露发生时
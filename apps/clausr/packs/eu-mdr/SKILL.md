---
description: "EU 医疗器械法规 2017/745 合规审核 — 核查技术文件、临床评估、UDI、PMS 及公告机构路径"
triggers: ["MDR", "医疗器材", "2017/745", "Medical Device", "CE认证"]
regulation_ids:
  - MDR
  - MDR_Annex_II
  - MDR_Annex_III
---

## Checks

### mdr_classification
1. **type**: enum(correct_classification, classification_state_need_verify, no_classification, inconsistent_classification)
2. **description**: 技术文件必须明确声明器械分类（I/IIa/IIb/III）并说明分类依据（MDR Annex VIII 规则 1-22）。
3. **clause**: MDR Art 10(3), Annex VIII
4. **sample**: Class IIb per Annex VIII Rule 9（有源治疗器械，潜在给药用途）。

### mdr_conformity_route
1. **type**: enum(correct_route, incompatible_route, no_route_stated)
2. **description**: 必须说明合规评估路径（Annex IX QMS + Annex X/XI，或 Annex IX + Annex X/XI 的组合，或自我声明仅限 I 类）。路径必须与分类一致。
3. **clause**: MDR Art 52
4. **sample**: Class IIb → Annex IX + Annex X（NB 参与完整 QMS 审核）。

### mdr_udidi
1. **type**: enum(udi_di_provided, udi_di_missing, udi_pi_structure_described, udi_basic_provided, udi_missing)
2. **description**: 产品标识必须包含 UDI-DI。技术文件应包含 UDI-DI 分配说明和 UDI-PI 结构描述。Basic UDI-DI (DI nr. of device identifier) 应与 Eudamed 注册一致。
3. **clause**: MDR Art 27, Annex VI Part C
4. **sample**: UDI-DI: 08512345678901, Basic UDI-DI: 0123456789ABCDEF。

### mdr_srn_registration
1. **type**: enum(srn_provided_economic_operators, srn_missing_economic, srn_missing_manufacturer, srn_missing_all)
2. **description**: 经济运营者（制造商、进口商、授权代表）在 DOC 上须注明 SRN。至少制造商的 SRN 必须存在。SRN 格式应为国家缩写-字母数字组合。
3. **clause**: MDR Art 31
4. **sample**: 制造商 SRN: DE-MF-000001234。

### mdr_nb_involvement
1. **type**: enum(nb_correct_for_class, nb_class_mismatch, nb_missing_required, nb_not_needed_class_i, nb_invalid)
2. **description**: 若产品为 I 类（非无菌/非测量/非可重复使用手术器械），无需 NB。其余均需 NB 参与。NB 编号须与 NB 公告范围一致。
3. **clause**: MDR Art 52
4. **sample**: NB 0123（TÜV SÜD）参与 Annex IX 审核，产品为 Class IIb。

### mdr_clinical_evaluation
1. **type**: enum(cer_referenced, cer_summary_included, cer_missing, literature_only_no_justification)
2. **description**: 技术文件必须包含或引用临床评价报告（CER），包括临床数据来源（临床试验/文献/PMCF 数据）。若仅依赖文献需说明充分理由（等同器械论证）。
3. **clause**: MDR Art 61, Annex XIV Part A
4. **sample**: CER 引用 5 项临床研究和 3 项等同器械文献，含 PMCF 计划。

### mdr_essential_requirements
1. **type**: enum(annex_i_checklist_complete, annex_i_checklist_partial, annex_i_checklist_missing, gsp_not_addressed)
2. **description**: 必须逐条覆盖 Annex I（通用安全与性能要求 GSPR）。建议使用 Checklist 形式，每条款注明"符合"及引用标准/文件。
3. **clause**: MDR Art 10(3), Annex I
4. **sample**: GSPR 逐条对照表，共 23 章，全部覆盖并有标准或设计文档交叉引用。

### mdr_pms_plan
1. **type**: enum(pms_plan_included, pmcf_plan_referenced, pms_plan_missing, pmcf_plan_missing, pms_reports_only)
2. **description**: 必须包含 PMS 计划（Post-Market Surveillance Plan）和 PMCF 计划（Post-Market Clinical Follow-up），或 PMCF 不适用之合理理由。
3. **clause**: MDR Art 84, Annex III
4. **sample**: PMS Plan 含数据收集方法、PMCF Plan 含临床跟踪方案。

### mdr_ce_marking
1. **type**: enum(present_nb_anno_dd, present_no_nb, present_no_last_two_year, missing, wrong_format)
2. **description**: CE 标志必须附最后两位适用年份（如 CE 2024）。若 NB 参与则须附 NB 编号。
3. **clause**: MDR Art 20, Annex V
4. **sample**: CE 2024 0123 — 符合年份和 NB 编号要求。

## Red Lines

- ❌ 不得将 MDD（93/42/EEC）或 AIMDD（90/385/EEC）证书等同为 MDR 合规证据
- ❌ 不得忽略 UDI 要求——MDR 强制要求 UDI-DI/UDI-PI
- ❌ 不得接受 I 类医疗器械自我声明时无 SRN 和 EU 代表
- ❌ 不得忽略 NB 的 MDR 指定范围同公告范围的匹配

## Lessons Learnt

(System-maintained area, initially empty.)

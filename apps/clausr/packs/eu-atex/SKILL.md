---
description: "EU 防爆指令 2014/34/EU 合规审核 — 核查 ATEX 设备分类、点火危险评估、标记要求、技术文件及公告机构路径"
triggers: ["ATEX", "防爆", "2014/34/EU", "Explosive Atmosphere", "CE认证"]
regulation_ids:
  - ATEX
  - ATEX_Annex_II
---

## Checks

### atex_classification
1. **type**: enum(correct_group_cat, cat_invalid_for_group, missing_atex_class, partial_classification, wrong_gas_group)
2. **description**: 必须明确标识设备组别（I=矿山/Ma/b，II=地表气体，III=粉尘）和类别（1/2/3）以及气体组别（IIA/IIB/IIC）和温度级别（T1-T6）。
3. **clause**: ATEX Annex II, EN 60079-0
4. **sample**: II 2G Ex db IIC T6 Gb — 完整分类。

### atex_ignition_hazard_assessment
1. **type**: enum(complete_iha, partial_iha, missing_declared_not_applicable, missing)
2. **description**: 必须包含点火危险评估（Ignition Hazard Assessment, IHA），识别所有可能的点火源（热表面、火花、静电等），并说明对应措施。
3. **clause**: ATEX Art 5(3), Annex II
4. **sample**: IHA 覆盖热表面、机械火花、静电放电、闪电、射频等 13 类点火源。

### atex_essential_safety
1. **type**: enum(annex_ii_checklist_complete, annex_ii_checklist_partial, missing)
2. **description**: 技术文件必须对标 ATEX Annex II 基本安全与健康要求（ESHR），逐条确认符合性。
3. **clause**: ATEX Annex II
4. **sample**: ESHR 对照表覆盖 Annex II 全部条款，含标准引用和设计备注。

### atex_nb_certificate
1. **type**: enum(eu_type_exam_cert, qms_cert, no_cert, wrong_standard, eu_type_exam_wrong_category)
2. **description**: Category 2 及以上设备须有 EU 型式检验证书（EU-type Examination Certificate, Module B），由 NB 出具。Category 1 还需产品验证（Module C1）或生产 QMS（Module D）。
3. **clause**: ATEX Art 13, Annex III
4. **sample**: EU-type Examination Certificate No. ATEX-2024-5678 by NB 0123。

### atex_marking
1. **type**: enum(complete_marking, partial_marking, wrong_order, missing)
2. **description**: CE + NB 编号 + ⓧ + Group/Category + Ex + Gas Group + Temperature Class + Equipment Protection Level (EPL) + 序列号/批号 + 生产年份。
3. **clause**: ATEX Art 7, EN 60079-0
4. **sample**: CE 0123 ⓧ II 2G Ex db IIC T6 Gb SN 2024001。

### atex_instructions_safety_info
1. **type**: enum(pass_safety_language_mouth, pass_safety_data, missing_safety_info, no_atex_section)
2. **description**: 说明书必须包含 ATEX 安全信息：安装区域要求、使用条件（气体/粉尘类型、温度范围）、维护要求、防静电措施等。
3. **clause**: ATEX Annex II §1.0.6
4. **sample**: 说明书含 ATEX 安全章节，规定安装区域为 Zone 1，环境温度 -20°C ~ +60°C。

## Red Lines

- ❌ 不得接受无 IIC 认证的设备用于 IIC 环境（即使客户声称"可接受"）
- ❌ 不得忽略 FISCO/FNICO 概念当涉及现场总线本质安全系统
- ❌ 不得将 IECEx 认证等同为 EU ATEX 认证（IECEx ≠ ATEX）
- ❌ 不得忽略温度级别 T 与设备表面温度的关系

## Lessons Learnt

(System-maintained area, initially empty.)

---
description: "EU 电磁兼容指令 2014/30/EU 合规审核 — 核查 EMC 声明、技术文件、协调标准、防护措施及 CE 标志要求"
triggers: ["EMC", "电磁兼容", "2014/30/EU", "Electromagnetic Compatibility", "CE认证"]
regulation_ids:
  - EMC
  - EMC_Annex_II
---

## Checks

### emc_doctype
1. **type**: enum(emc_only, emc_as_part_of_md, emc_as_part_of_lvd, not_found)
2. **description**: 声明必须明确引用 2014/30/EU（EMC 指令），可作为单独 DOC 或与其他指令合并。若产品为机械且 EMC 作为 MD 的一部分，仍需明确提及 EMC 要求。
3. **clause**: EMC Art 14
4. **sample**: DOC 标题引用 2014/30/EU，标准列表包括 EN 55011 和 EN 61000-6-2。

### emc_standards
1. **type**: enum(emission_immunity_both, emission_only, immunity_only, missing_or_withdrawn)
2. **description**: 必须列出至少一项发射（emission）标准和一项抗扰度（immunity）标准，除非适用产品系列标准同时覆盖两者。检查标准是否被撤回（如 EN 55022 → EN 55032）。
3. **clause**: EMC Art 13
4. **sample**: EN 55032:2015+A1:2020 (emission) + EN 55035:2017+A11:2020 (immunity)。

### emc_test_report
1. **type**: enum(referenced_with_date, referenced_no_date, missing, ind_unclear)
2. **description**: 技术文件应包含或引用 EMC 测试报告（含报告编号、日期、测试机构）。若适用产品系列标准声明而无测试报告，需说明理由。
3. **clause**: EMC Annex II
4. **sample**: 测试报告 No. EMC-2024-00123，由 TÜV Rheinland 于 2024-03-15 出具。

### emc_limits_class
1. **type**: enum(class_a_stated, class_b_stated, class_ambiguous, class_missing)
2. **description**: 必须声明是 Class A（工业环境）还是 Class B（住宅环境）限制。若为 Class A 需注明"不适合住宅环境"。
3. **clause**: EN 55011/EN 55032
4. **sample**: 声明"Class A equipment — intended for industrial environment only"。

### emc_ce_marking
1. **type**: enum(present_with_year, present_no_year, missing)
2. **description**: CE 标志必须贴附于产品，后接公告机构编号（如适用），且附最后两位适用年份。
3. **clause**: EMC Art 18
4. **sample**: CE 标志 + 2024，无 NB 编号（非强制路径）。

### emc_env_conditions
1. **type**: enum(industrial_both, residential_both, industrial_stated, residential_stated, missing)
2. **description**: 技术文件必须说明产品适用的电磁环境条件（工业/住宅/两者皆可）以及安装要求。
3. **clause**: EMC Annex II
4. **sample**: "Intended for industrial environment. Installation per EN 61000-5 series."

## Red Lines

- ❌ 不得将 CB 测试报告等同为 EMC 合规测试报告
- ❌ 不得将 FCC 测试报告直接作为 EU EMC 合规证据（FCC 辐射限值与 EU 不同）
- ❌ 不得忽略标准撤回/替代（如 EN 55022 已被 EN 55032 替代）

## Lessons Learnt

(System-maintained area, initially empty.)

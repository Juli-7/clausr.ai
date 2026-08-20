---
description: "EU 废弃电气电子设备指令 2012/19/EU 合规审核 — 核查注册义务、回收设计、标记与用户告知要求"
triggers: ["WEEE", "电子废弃物", "2012/19/EU", "回收", "环保"]
regulation_ids:
  - WEEE
  - WEEE_Annex
---

## Checks

### weee_registration
1. **type**: enum(all_member_states_registered, partial_registration, no_registration, na_non_eu_sales)
2. **description**: 必须在产品销售的每个 EU/EEA 成员国完成生产者注册并获得国家注册号码。各国注册机构不同（如德国 EAR、英国 EA、法国 ADEME）。
3. **clause**: WEEE Art 15
4. **sample**: 德国 WEEE Reg.-Nr. DE 12345678（EAR），英国 WEEE Producer Registration No. WEE/AB1234CD。

### weee_category
1. **type**: enum(correct_category, ambiguous_category, wrong_category, b2b_vs_b2c_documented, b2b_vs_b2c_not_documented)
2. **description**: 必须正确分类产品类别（2012/19/EU Annex I/II 中 1-10 类或 2018 年后的开放类别）。区分 B2B 和 B2C 产品路径不同。
3. **clause**: WEEE Art 6, Annex I/II
4. **sample**: Category 3 (IT and telecommunications equipment), B2C classification。

### weee_marking
1. **type**: enum(crossed_wheelie_bin_present, symbol_present_no_standard, missing)
2. **description**: 产品必须标注打叉带轮垃圾桶符号（crossed-out wheelie bin, per EN 50419）。标记应清晰不可擦除。
3. **clause**: WEEE Art 14
4. **sample**: 打叉带轮垃圾桶符号印在产品背面铭牌旁。

### weee_user_instructions
1. **type**: enum(disposal_instructions_in_manual, separate_collection_stated, user_responsibility_stated, not_in_manual)
2. **description**: 说明书或包装必须包含：①请勿作为未分类市政废品处置；②分类收集说明；③最终用户处理责任。通常使用标准语句。
3. **clause**: WEEE Art 14
4. **sample**: 说明书包含标准 WEEE 处置说明："不得与生活垃圾一起丢弃，请交回回收点"。

### weee_financial_guarantee
1. **type**: enum(guarantee_provided, guarantee_evidence_missing, guarantee_claimed_waiver, collective_scheme)
2. **description**: 生产者须提供财务担保（银行保函、回收保险或参与集体回收计划），确保 WEEE 回收费用有保障。
3. **clause**: WEEE Art 15
4. **sample**: 参与 EAR 集体回收计划，合作协议编号 EAR-2024-5678。

### weee_treatment_info
1. **type**: enum(treatment_info_provided, en_50625_referenced, wb_ref_only, missing)
2. **description**: 须向处理设施提供产品处理信息（含材料类型、危险组件位置、拆解步骤）。可依照 EN 50625 系列标准。
3. **clause**: WEEE Art 14
4. **sample**: 处理信息包含拆解步骤、电池/PCB 位置、材料类型编码 per EN 50625-1。

## Red Lines

- ❌ 不得将德国 EAR 注册等同为全 EU 注册（每个成员国需单独注册）
- ❌ 不得忽略 B2C 的分类收集目标（65% 收集率目标）
- ❌ 不得忽略 2018 年后的开放类别分类变化
- ❌ 不得在产品上仅印"回收"文字而无打叉垃圾桶符号

## Lessons Learnt

(System-maintained area, initially empty.)

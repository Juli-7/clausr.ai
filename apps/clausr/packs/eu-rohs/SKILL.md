---
description: "EU 有害物质限制指令 2011/65/EU 合规审核 — 核查六项限用物质检测报告、豁免条款、技术文件及 CE 标志"
triggers: ["RoHS", "有害物质", "2011/65/EU", "铅", "汞", "镉", "CE认证"]
regulation_ids:
  - RoHS
  - RoHS_Annex_II
  - RoHS_Annex_III
---

## Checks

### rohs_substance_list
1. **type**: enum(all_six_covered, missing_one_or_more, substance_not_addressed)
2. **description**: DOC/技术文件必须确认六项限用物质：铅(Pb)、汞(Hg)、镉(Cd)、六价铬(Cr6+)、多溴联苯(PBB)、多溴二苯醚(PBDE)。限值：每种物质 ≤ 0.1% (1000 ppm)，镉 ≤ 0.01% (100 ppm)。
3. **clause**: RoHS Art 4, Annex II
4. **sample**: 所有六项物质均低于限值（Cd<50ppm，其他<800ppm）。

### rohs_testing_method
1. **type**: enum(xrf_screening, chemical_analysis, supplier_declaration_only, no_test_evidence, mixed_method_documented)
2. **description**: 须说明测试方法：XRF 筛选、湿化学分析（ICP-OES/ICP-MS）、或 GC-MS。仅供应商声明而无任何测试证据属不符合。建议采用 EN 62321 系列标准。
3. **clause**: RoHS Art 7, EN 62321
4. **sample**: XRF 初筛后对可疑材料进行 ICP-OES 定量分析 per EN 62321-5:2014。

### rohs_exemptions
1. **type**: enum(exemption_cited_correctly, exemption_expired, exemption_missing_number, exemption_needs_documentation, no_exemptions_claimed)
2. **description**: 若声明豁免需提供豁免条款编号（如 Annex III 7(a) "铅在电子陶瓷中"），并说明豁免到期日期。已过期的豁免不得使用。
3. **clause**: RoHS Annex III, Annex IV
4. **sample**: 豁免 7(c)-I 铅在玻璃中，到期 2026-07-21。

### rohs_scope
1. **type**: enum(eee_in_scope, eee_out_of_scope, battery_outside_scope, medical_device_mdr_crossref)
2. **description**: 确认产品是否属 RoHS 范围（EEE 依赖电气/电磁运行）。医疗器械和监测/控制设备属第 8/9 类——须确认是否排除或豁免。
3. **clause**: RoHS Art 2, Annex I
4. **sample**: 产品属第 3 类（IT 设备），完全在 RoHS 范围。

### rohs_homogeneous_material
1. **type**: enum(material_list_complete, material_list_partial, bom_reference_only, missing)
2. **description**: 技术文件须包含均质材料清单及每种材料的 RoHS 状态。简单 BOM 不够——需识别每个组件的每个均质材料（塑胶、金属、陶瓷）是否合规。
3. **clause**: RoHS Art 7, EN 62321-1
4. **sample**: 均质材料清单按部件编号分组，总计 156 种均质材料，全部标记为合规。

### rohs_ce_marking
1. **type**: enum(ce_present_with_year, ce_present_no_year, missing)
2. **description**: CE 标志必须贴附。DOC 必须包含 RoHS 要求声明。
3. **clause**: RoHS Art 10
4. **sample**: CE 标志 + 2024 DOC 含 RoHS 声明。

## Red Lines

- ❌ 不得将整机 XRF 测试等同为均质材料级合规证据
- ❌ 不得接受已过豁免期仍继续使用的声明
- ❌ 不得忽略电缆/线束中 PVC 的铅稳定剂问题
- ❌ 不得忽略焊锡中铅含量（应<1000ppm）

## Lessons Learnt

(System-maintained area, initially empty.)

---
description: "EU 低电压指令 2014/35/EU 合规审核 — 核查电气安全技术文件、协调标准 EN 62368 / EN 60335 / EN 61010 及 CE 标志"
triggers: ["LVD", "低电压", "2014/35/EU", "Low Voltage", "CE认证"]
regulation_ids:
  - LVD
  - LVD_Annex_I
---

## Checks

### lvd_scope_voltage
1. **type**: enum(within_scope, ac_below_50, dc_below_75, above_1000v, unclear)
2. **description**: 确认产品电压等级在 LVD 范围内：AC 50V-1000V 或 DC 75V-1500V。若超出范围则不适用 LVD（可能适用 MD 或其他指令）。
3. **clause**: LVD Art 1
4. **sample**: 额定电压 AC 230V，在 LVD 适用范围内。

### lvd_standards
1. **type**: enum(applicable_and_current, applicable_withdrawn, wrong_standard, missing)
2. **description**: 必须列出适用的协调安全标准。常见：EN 62368-1（ITE/AV）、EN 60335-1（家电）、EN 61010-1（测量/控制）。检查标准版本是否现行有效，不得引用已撤回标准。
3. **clause**: LVD Art 5
4. **sample**: EN 62368-1:2014+A11:2017 — 适用于 ITE 设备。

### lvd_risk_assessment
1. **type**: enum(explicit_referenced, implicit_in_design, missing)
2. **description**: 技术文件应包含电气安全风险评估（Electrical Safety Risk Assessment），或明确引用所依据标准的风险评估条款。仅列出标准名称不够。
3. **clause**: LVD Annex III
4. **sample**: 技术文件包含电气安全风险评估，覆盖电击、能量危险、火灾、机械危险（因电气引起）。

### lvd_protection_against_hazards
1. **type**: enum(electric_shock, energy_fire_mech, all_covered, partial_missing)
2. **description**: 必须覆盖三类危害防护：①电击防护（基本绝缘+附加绝缘或双重绝缘/接地）；②能量危险防护（断电后电容放电等）；③电气引起的火灾和机械危险防护。
3. **clause**: LVD Annex I
4. **sample**: I 类设备，接地保护+基本绝缘，电容放电 <2s。

### lvd_marking_instructions
1. **type**: enum(pass, missing_rating_label, missing_safety_instructions, both)
2. **description**: 产品铭牌须包含额定电压、频率、功率/电流、制造商/商标、型号。说明书须包含安全操作说明、清洁/维护警告。
3. **clause**: LVD Annex I
4. **sample**: 铭牌标注 230V~50Hz 150W，含安全说明章节。

### lvd_ce_marking
1. **type**: enum(present, ce_nb, missing, wrong_format)
2. **description**: CE 标志必须贴附于产品。LVD 无需公告机构（自我声明路径），但若涉及其他指令需 NB 则 CE 标志后应跟 NB 编号。
3. **clause**: LVD Art 7
4. **sample**: CE 标志清晰可见，无 NB 编号（LVD 自我声明路径）。

## Red Lines

- ❌ 不得将 LVD 不适用于纯低压 DC 产品（如 USB 充电器 5V DC 不属于 LVD 范围）
- ❌ 不得接受引用 IEC 标准（非 EN 版本）作为协调标准的证据
- ❌ 不得忽略 I 类/II 类设备分类对应的不同保护要求

## Lessons Learnt

(System-maintained area, initially empty.)

---
description: "EU 符合性声明（DOC）审核 — 依据 MD 2006/42/EC Annex II，逐项核查声明标题、机器标识、制造商信息、授权代表、指令列表、协调标准、公告机构、签字人信息"
triggers: ["DOC", "Declaration of Conformity", "符合性声明", "MD", "2006/42/EC", "机械指令", "CE认证"]
regulation_ids:
  - MD
  - MD_Annex_II
---

## Checks

### declaration_title
1. **type**: enum(found_ec, found_eu, not_found_ocr_risk, not_found_editable, misspelled)
2. **attention**: 声明标题 EC Declaration of Conformity EU Declaration of Conformity 页眉 页脚 底纹
3. **description**: 文件必须包含明确的"EC Declaration of Conformity"或"EU Declaration of Conformity"。标题可能位于正文首部、页眉、页脚、灰色底纹区域或水印中。不接受仅"Certificate of Conformity"等替代标题（除非同时出现标准标题）。
4. **clause**: MD.Annex II.A
5. **depends_on**: (none)
6. **sample**: 文档标题为"EC Declaration of Conformity"[S1.c1]，符合 MD Annex II 要求。

### machine_identification
1. **type**: enum(complete, missing_name, missing_model, ocr_uncertain)
2. **attention**: 机器名称 Machine Name Model Type 型号 Equipment Product Type No.
3. **description**: 必须包含机器名称（Machine Name）和型号/类型（Model/Type）。通过关键词 Machine、Equipment、Product、Model、Type、Type No. 等索引。型号通常为字母数字组合（如 XYZ-2000A）。
4. **clause**: MD.Annex II.A
5. **depends_on**: (none)
6. **sample**: 机器名称为"Leakage Testing Machine"[S1.c2]，型号"M236-QHJ"[S1.c2]，清晰完整。

### manufacturer_information
1. **type**: enum(complete, missing_name, missing_country_city_street, ocr_partial)
2. **attention**: 制造商名称 Manufacturer Address 地址 国家 城市 街道 完整法律实体
3. **description**: 必须包含：①制造商完整法律实体名称；②制造商地址（至少含国家、城市、街道/门牌号三级）。邮政编码不强制要求（MD 仅要求"full address"，可联系即可）。
4. **clause**: MD.Annex II.A
5. **depends_on**: (none)
6. **sample**: 制造商"Fujian Yingyeqiang Intelligent Equipment Co., Ltd."[S1.c3]，地址"1 Zengban Road, Zhangwan Town"[S1.c3]，含国家/省/市/街道，完整。

### authorized_representative
1. **type**: enum(na_manufacturer_in_eu, provided, missing, manufacturer_address_unclear)
2. **attention**: 授权代表 Authorized Representative EU Representative Authorised 技术文件编制人 Person authorised to compile the technical file
3. **description**: MD 附录 II(2) 要求 DOC 必须包含获授权编制技术文件之人的名称及地址，且该人员须在欧盟境内成立。若制造商在欧盟境内则此项不适用；若在境外则必须包含。
4. **clause**: MD.Annex II.A
5. **depends_on**: manufacturer_information
6. **sample**: 制造商在中国[S1.c3]，已提供欧盟联系人"Contemporary Amperex Technology Hungary Kft."[S1.c4]，符合要求。

### directives_list
1. **type**: enum(complete_with_md, missing_md, wrong_format, unchecked_checkbox, ocr_uncertain)
2. **attention**: 指令列表 Directives applied 2006/42/EC EMC 2014/30/EU LVD 2014/35/EU RoHS 2011/65/EU 复选框 checkbox
3. **description**: 必须包含 2006/42/EC（机械指令）。若机器带电气/电子部件通常还需 EMC 和/或 LVD 指令。指令编号格式应为四位年份（如 2006/42/EC）。复选框以 ☐ 形式列出时必须明确勾选 ☒ 或有"applicable"文字声明。
4. **clause**: MD.Annex II.A
5. **depends_on**: (none)
6. **sample**: 指令列表存在但复选框未勾选（`- [ ]`）无"适用"声明[S1.c5]，不构成有效声明。

### harmonized_standards
1. **type**: enum(valid, missing, bad_format_no_year, only_non_harmonized, withdrawn_possible, ocr_uncertain)
2. **attention**: 协调标准 Harmonized Standards EN ISO EN IEC EN XXXX:YYYY 标准编号 年份 撤回
3. **description**: 应列出至少一项与机械安全相关的协调标准。格式须为 EN XXXXX:YYYY 或 EN ISO XXXXX:YYYY 或 EN IEC XXXXX:YYYY，年份为四位数字且不得缺失。不得引用已撤回的标准（如 EN 954-1:1996）——此项需数据库比对，若无法自动比对则标记 IND。
4. **clause**: MD.7
5. **depends_on**: (none)
6. **sample**: 标准"EN ISO 12100:2010"[S1.c6]格式正确含年份，"EN 60204-1:2018"[S1.c6]格式正确。

### notified_body
1. **type**: enum(na_non_annex4, nb_provided, nb_not_needed_stated, nb_missing, annex4_unclear)
2. **attention**: 公告机构 Notified Body NB 编号 EC型式检验 EC type examination Annex IV 附录IV 协调标准
3. **description**: 若机器属 MD 附录 IV 机械且未完全按协调标准设计，则 DOC 必须注明公告机构编号（如 NB 0123）和证书编号。若附录 IV 机械完全按协调标准设计，可不需要 NB，但 DOC 中应声明"No notified body involved"。
4. **clause**: MD.7
5. **depends_on**: (none)
6. **sample**: 非附录IV机械[S1.c7]，不适用。

### signatory_info
1. **type**: enum(complete, missing_one, ocr_uncertain)
2. **attention**: 签字人 Signature Signatory 签发地点 Place of issue 签发日期 Date 签字人姓名 printed name 职位 title function 签名图像
3. **description**: 必须包含五项：①签发地点（城市）；②签发日期（DD/MM/YYYY 或 YYYY-MM-DD）；③签字人姓名（打印体）；④签字人职位；⑤签名（手写扫描或电子签名）。仅签名图像或公司印章而无打印姓名和职位判定为 F。姓名和职位可写在同一行。
4. **clause**: MD.Annex II.A
5. **depends_on**: (none)
6. **sample**: 地点"Fujian, P.R. China"[S1.c8]，日期空白[S1.c8]，姓名"Bairuochen"[S1.c8]，职位无[S1.c8]，签名图像存在。缺少日期和职位。

### language_and_liability
1. **type**: enum(pass, no_english, liability_clause_found, ocr_uncertain)
2. **attention**: 语言 Language 英文 English 责任限制 Liability 样品 only for sample prototype not covering series limited to test sample
3. **description**: DOC 须至少包含英文版本。不得出现"only for sample"、"limited to test sample"、"not covering series"、"prototype only"等限制声明范围的语句。
4. **clause**: MD.Annex II.C
5. **depends_on**: (none)
6. **sample**: 英文版本完整[S1.c9]，无限制条款[S1.c9]，符合要求。

## Red Lines

- ❌ 不得在 OCR 识别质量不足时直接判定 F — 应判 IND 并添加【OCR提醒】
- ❌ 不得因页眉/页脚区域未被 OCR 提取而判定标题/日期缺失 — 应判 IND
- ❌ 不得将仅包含"Certificate of Conformity"而无标准标题的文件判定为通过
- ❌ 不得将空白复选框视为有效声明
- ❌ 不得忽略标准编号中缺失年份的问题
- ❌ 不得将邮政编码缺失作为地址不完整的判定依据
- ❌ 文件为图片或扫描 PDF 时，对标题、签发日期、签字人信息等关键字段应谨慎使用 F 判定

## Lessons Learnt

(System-maintained area, initially empty.)

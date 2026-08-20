---
description: "EU 机械说明书合规审核 — 依据 MD 2006/42/EC Annex I §1.7.4，逐项核查说明书语言、内容完整性、安全信息、安装/使用/维护说明"
triggers: ["说明书", "Manual", "Instruction Manual", "User Manual", "操作手册", "MD", "2006/42/EC", "机械指令"]
regulation_ids:
  - MD
  - MD_Annex_I
---

## Checks

### c01_language_original
1. **type**: enum(pass, no_original_statement, not_official_language)
2. **description**: 说明书应标明"Original instructions"或注明翻译自原件。必须至少包含一种欧盟官方语言（通常为英文）。
3. **clause**: MD Annex I §1.7.4.1
5. **attention**: 说明书原件 Original instructions 语言 language 翻译 translation 官方语言
8. **sample**: 说明书封面标注"Original instructions"[S1.c1]，提供英文版本，符合要求。

### c02_intended_use_foreseeable_misuse
1. **type**: enum(pass, missing_intended_use, missing_misuse, both_missing)
2. **description**: 必须说明机械的预定使用，并警告合理可预见的误用方式。
3. **clause**: MD Annex I §1.7.4.2(a)(b)
5. **attention**: 预定使用 intended use 可预见误用 foreseeable misuse 禁止用途
8. **sample**: 说明书明确描述预定用途为"切割木材"[S1.c2]，并列出禁止"切割金属"等误用[S1.c2]。

### c03_target_audience
1. **type**: enum(pass_professional, pass_non_professional, fail_too_technical, ind_unclear, na_professional_only)
2. **description**: 若非专业人员操作，说明书须通俗易懂。若非专业人员可操作，应避免过于技术性的术语。
3. **clause**: MD Annex I §1.7.4.2(c)
5. **attention**: 操作者 operator 非专业人员 non-professional 通俗易懂 技术语言
8. **sample**: 说明书语言通俗步骤清晰[S1.c3]，适合非专业人员操作。

### c04_manufacturer_info
1. **type**: enum(pass, missing_name, missing_address, language_mismatch, ind_ocr)
2. **description**: 必须包含制造商的完整名称和详细地址（国家、城市、街道）。若制造商不在欧盟境内，还须包含欧盟授权代表信息。语言须与正文一致。
3. **clause**: MD Annex I §1.7.4.2(d)
5. **attention**: 制造商 manufacturer 名称 地址 国家 城市 街道 授权代表
8. **sample**: 制造商"ABC GmbH"[S1.c4]，地址"Musterstr. 12, 80335 Munich, Germany"[S1.c4]，完整且语言一致。

### c05_machine_name
1. **type**: boolean
2. **description**: 说明书必须给出机器上标出的机器名称（与铭牌一致），不必包含序列号。
3. **clause**: MD Annex I §1.7.4.2(e)
5. **attention**: 机器名称 machine name 铭牌 型号 标识
8. **sample**: 说明书标明机器名称"Sawmaster SM200"[S1.c5]，与铭牌一致。

### c06_ec_declaration
1. **type**: enum(pass, fail, ind_vague)
2. **description**: 说明书必须包含 EC 合格声明或引用该声明（通常附 DOC 文件或注明"见随附的 EC 符合性声明"）。
3. **clause**: MD Annex I §1.7.4.2(f)
5. **attention**: EC符合性声明 EC Declaration of Conformity DOC 合格声明
8. **sample**: 说明书明确声明"符合 EC 指令"[S1.c6]并提供 DOC 引用。

### c07_comprehensive_description
1. **type**: boolean
2. **description**: 提供机器的综合描述（功能、主要部件、工作原理），至少一个段落。
3. **clause**: MD Annex I §1.7.4.2(g)
5. **attention**: 综合描述 comprehensive description 功能 主要部件 工作原理
8. **sample**: 说明书包含完整的功能描述和工作原理说明[S1.c7]。

### c08_drawings_diagrams
1. **type**: enum(pass, fail, ind_ocr)
2. **description**: 包含图样、图表（如结构图、操作界面图、原理图）以及相应的文字说明。至少有一幅图或表并配有文字说明。
3. **clause**: MD Annex I §1.7.4.2(h)
5. **attention**: 图样 drawings 图表 diagrams 结构图 原理图 操作界面图 说明
8. **sample**: 说明书包含结构图和操作界面图[S1.c8]，均配有文字说明。

### c09_workstation_description
1. **type**: boolean
2. **description**: 描述工作站（操作人员的位置、操作界面、控制装置等）。
3. **clause**: MD Annex I §1.7.4.2(i)
5. **attention**: 工作站 workstation 操作位置 操作界面 控制装置
8. **sample**: 说明书描述"主控制面板位于机器前方"[S1.c9]。

### c10_intended_use_detail
1. **type**: boolean
2. **description**: 说明书的正文（非封面或目录）必须给出机器设计用于做什么的明确描述（如"该机器用于电泳涂装表面处理"）。注意区分：描述本手册的范围（"本手册描述运输、安装等注意事项"）≠ 机器的预定使用。须检查是否明确写出了机器本身的用途/功能/应用范围。
3. **clause**: MD Annex I §1.7.4.2(j)
5. **attention**: 预定使用 intended use 用途 功能 应用范围 机器设计目的
7. **depends_on**: c02
8. **sample**: 说明书正文明确写明"The electrophoresis system is designed for ED coating surface treatment"[S1.c10]。

### c11_foreseeable_misuse_detail
1. **type**: boolean
2. **description**: 必须列出合理可预见的误用方式或禁止用途（如"禁止切割金属材料"）。注意与 c02 区分：c02 检查是否提到误用的存在，此处要求是否有具体清单或详细描述。
3. **clause**: MD Annex I §1.7.4.2(k)
5. **attention**: 合理可预见误用 foreseeable misuse 误用示例 禁止用途 非预期操作
7. **depends_on**: c02
8. **sample**: 说明书列出"禁止切割金属、禁止超负荷运行"等误用清单[S1.c11]。

### c12_assembly_installation
1. **type**: enum(pass, fail_na_no_detail, fail_missing)
2. **description**: 提供装配、安装和连接（电气、气动、液压等）的说明。至少包含安装步骤和连接要求。
3. **clause**: MD Annex I §1.7.4.2(l)
5. **attention**: 装配 assembly 安装 installation 连接 connection 电气 气动 液压
8. **sample**: 说明书提供安装步骤和电气连接图[S1.c12]。

### c13_commissioning_operation
1. **type**: boolean
2. **description**: 提供投入使用（试运行）和日常使用的操作说明（启动、操作、停止步骤）。
3. **clause**: MD Annex I §1.7.4.2(m)
5. **attention**: 投入使用 commissioning 试运行 日常使用 启动 操作 停止
8. **sample**: 说明书包含启动、操作、停止的完整步骤[S1.c13]。

### c14_residual_risks
1. **type**: boolean
2. **description**: 指明设计无法消除的遗留风险（残留风险），如高温表面、锐边、挤压点。
3. **clause**: MD Annex I §1.7.4.2(n)
5. **attention**: 遗留风险 residual risks 残留风险 高温 锐边 挤压
8. **sample**: 说明书明确列出遗留风险"高温表面"[S1.c14]和"锐边"[S1.c14]。

### c15_user_protection_measures
1. **type**: boolean
2. **description**: 说明用户需自行采取的保护措施（如加装防护罩、使用个人防护装备）。
3. **clause**: MD Annex I §1.7.4.2(o)
5. **attention**: 保护措施 protection measures 防护罩 PPE 个人防护 用户
8. **sample**: 说明书要求用户佩戴安全眼镜和防护手套[S1.c15]。

### c16_stability_conditions
1. **type**: boolean
2. **description**: 说明在使用、运输、装配、拆卸、试验或可预见故障期间保持稳定性的条件。
3. **clause**: MD Annex I §1.7.4.2(p)
5. **attention**: 稳定性 stability 固定 锚定 倾翻 运输 装配 拆卸
8. **sample**: 说明书包含地脚螺栓固定要求[S1.c16]。

### c17_transport_handling_storage
1. **type**: enum(pass, missing_mass, missing_safety, both_missing)
2. **description**: 给出运输、搬运和贮存的安全说明，提供机器总质量及需单独搬运的各部件质量。
3. **clause**: MD Annex I §1.7.4.2(q)
5. **attention**: 运输 transport 搬运 handling 贮存 storage 质量 mass 重量 安全说明
8. **sample**: 说明书提供搬运安全说明和机器总质量 500kg[S1.c17]。

### c18_accident_failure_procedure
1. **type**: boolean
2. **description**: 说明发生事故或故障时的应急操作（如断电、停机步骤）。
3. **clause**: MD Annex I §1.7.4.2(r)
5. **attention**: 事故 accident 故障 failure 应急操作 断电 停机
8. **sample**: 说明书规定"发生故障立即按下急停按钮"[S1.c18]。

### c19_preventive_maintenance
1. **type**: enum(pass, fail_vague, fail_missing)
2. **description**: 提供预防性维护的周期和内容（如清洁、润滑、紧固），应有维护周期和项目清单。
3. **clause**: MD Annex I §1.7.4.2(s)
5. **attention**: 预防性维护 preventive maintenance 周期 清洁 润滑 紧固
8. **sample**: 说明书包含每日/每周/每月维护清单[S1.c19]。

### c20_safety_adjustments_repairs
1. **type**: boolean
2. **description**: 提供安全调整和维修的说明，并注明安全注意事项。
3. **clause**: MD Annex I §1.7.4.2(t)
5. **attention**: 安全调整 safety adjustment 维修 repair 调整张力 更换保险丝 安全注意
8. **sample**: 说明书包含更换保险丝的步骤和安全警告[S1.c20]。

### c21_health_critical_spare_parts
1. **type**: enum(pass, fail_vague_original, fail_missing, na_none)
2. **description**: 若备件技术条件影响操作者健康和安全，必须给出具体规格。不得笼统说"使用原厂备件"而无参数。
3. **clause**: MD Annex I §1.7.4.2(u)
5. **attention**: 备件 spare parts 健康 health 安全 型号 材质 技术条件
8. **sample**: 说明书列出滤芯型号"HF-2000"[S1.c21]及材质要求。

### c22_sound_pressure_level
1. **type**: enum(pass, fail, ind_unclear)
2. **description**: 给出工作位置的 A 加权发射声压级（LpA），说明何处超过/未超过 70 dB(A)。
3. **clause**: MD Annex I §1.7.4.2(v)
5. **attention**: 声压级 sound pressure LpA 噪声 noise dB(A) 测量 工作位置
8. **sample**: 说明书标注"LpA = 76 dB(A) at operator position"[S1.c22]。

### c23_radiation_info
1. **type**: enum(pass_stated, pass_no_radiation, fail_missing)
2. **description**: 若机械可能发射辐射，必须提供相关辐射信息及防护措施。若不产生辐射也应声明。
3. **clause**: MD Annex I §1.7.4.2(w)
5. **attention**: 辐射 radiation 电离 ionising 非电离 non-ionising 防护
8. **sample**: 说明书声明"本机不产生电离辐射"[S1.c23]。

### c24_cover_product_info
1. **type**: enum(pass, fail_missing_one, fail_missing_all)
2. **description**: 首页应清晰显示产品名称、型号、版本号（或出版日期）。三项齐全 → pass；缺少其中一项 → fail_missing_one；缺少两项及以上 → fail_missing_all。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 首页 cover 产品名称 product name 型号 model 版本号 version
8. **sample**: 首页显示 Name="Sawmaster", Model="SM200", Rev="2.0"[S1.c24]。

### c25_cover_timeliness
1. **type**: boolean
2. **description**: 应有出版日期或修订记录/版本号。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 出版日期 publication date 修订记录 revision 版本号 version 时效性
8. **sample**: 说明书包含版本号和出版日期[S1.c25]。

### c26_cover_contact_info
1. **type**: enum(pass, fail_missing_name_address, fail_missing_contact, fail_language_mismatch)
2. **description**: 应有公司名称、地址、电话或邮箱联系方式，且语言与正文一致。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 联系方式 contact 公司名称 地址 电话 邮箱 供方 服务机构
8. **sample**: 封面提供公司名称、地址和电话[S1.c26]，语言与正文一致。

### c27_product_basic_info
1. **type**: boolean
2. **description**: 说明预定使用、功能、应用范围。注意：描述本手册的编写目的（如"本手册供操作人员使用"）≠ 产品基本信息的描述。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 预定使用 intended use 功能 function 应用范围 application 产品基本信息
7. **depends_on**: c10
8. **sample**: 说明书明确描述产品用于"木材切割"[S1.c27]。

### c28_product_misuse_prohibited
1. **type**: boolean
2. **description**: 列出可预见的误用和禁止用途。注意与 c11 区分：c11 检查是否有具体清单，此处要求更详细的具体禁止事项。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 误用 misuse 禁止用途 prohibited use 可预见 合理
7. **depends_on**: c11
8. **sample**: 说明书列出禁止"切割金属材料"[S1.c28]。

### c29_dimensions_weight_capacity
1. **type**: enum(pass, fail, na)
2. **description**: 给出外形尺寸、质量、容量（如油箱容积、最大载荷）。至少包含尺寸和质量。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 尺寸 dimensions 质量 weight 容量 capacity 外形尺寸 油箱容积 载荷
8. **sample**: 说明书给出外形尺寸 1200x800x1500mm 和质量 500kg[S1.c29]。

### c30_performance_data
1. **type**: enum(pass, fail, na)
2. **description**: 给出关键性能指标（速度、功率、精度等）。简单机器可 N/A 但需注明。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 性能数据 performance 速度 功率 精度 关键指标
8. **sample**: 说明书给出额定功率 5kW 和最大转速 3000rpm[S1.c30]。

### c31_supply_data
1. **type**: enum(pass, fail, na)
2. **description**: 提供电源、压缩空气、水、清洁剂、润滑剂等供应数据。至少给出电气供应数据。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 供应数据 supply 电压 voltage 频率 frequency 电流 current 压缩空气 水 压力
8. **sample**: 说明书标注"400V/50Hz/16A"[S1.c31]电气供应数据。

### c32_noise_vibration_emission
1. **type**: enum(pass, fail, ind_no_method)
2. **description**: 提供噪声、振动、辐射、排放物数据，并说明参考的测量方法。至少应有噪声数据 LpA。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 噪声 noise 振动 vibration 辐射 emission 气体 蒸汽 粉尘 LpA 测量方法
8. **sample**: 说明书提供 LpA=76dB(A)[S1.c32]并注明测量标准 EN ISO 3744。

### c33_warning_information
1. **type**: boolean
2. **description**: 包含安全警告信息（如"高压"、"高温"、"旋转部件"），应有警告符号或文字。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 警告 warning 高压 高温 旋转部件 安全符号 警示
8. **sample**: 说明书包含"高压危险"警告标识[S1.c33]。

### c34_residual_risk_statement
1. **type**: boolean
2. **description**: 明确指出残留风险（与 c14 相同或补充）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 残留风险 residual risk 遗留风险 残余风险 声明
8. **sample**: 说明书明确指出"高温表面残留风险"[S1.c34]。

### c35_end_of_life_disposal
1. **type**: boolean
2. **description**: 提供报废处理建议（拆解、回收、环保处理）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 报废 disposal 拆解 回收 环保处理 使用寿命结束
8. **sample**: 说明书包含拆解和回收说明[S1.c35]。

### c36_expected_lifespan
1. **type**: boolean
2. **description**: 给出产品的预期寿命（设计寿命）及寿命结束时的处理方式。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 预期寿命 expected lifespan 设计寿命 使用寿命 处理方式
8. **sample**: 说明书标明设计寿命 10 年[S1.c36]。

### c37_ppe_info
1. **type**: boolean
2. **description**: 列出需要使用的个人防护装备（PPE），如安全眼镜、耳塞、手套等。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 个人防护 PPE 安全眼镜 耳塞 手套 防护装备
8. **sample**: 说明书要求操作时佩戴安全眼镜和耳塞[S1.c37]。

### c38_storage_conditions
1. **type**: boolean
2. **description**: 说明贮存条件（温度、湿度、防尘等）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 贮存条件 storage 温度 湿度 防尘 环境
8. **sample**: 说明书要求贮存温度 5-40°C 湿度 <80%[S1.c38]。

### c39_dimensions_weight_cog
1. **type**: enum(pass, fail_missing, fail_incomplete)
2. **description**: 完整提供尺寸、质量、重心位置。三项齐全（即使缺少具体数值但有明确说明或图示）→ pass；缺少至少一项且其他内容也有缺失 → fail_missing；有提及但不完整（如只有尺寸和质量但没有重心）→ fail_incomplete。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 尺寸 质量 重心 centre of gravity 重心位置
8. **sample**: 说明书提供尺寸、500kg 质量及重心位置图示[S1.c39]。

### c40_handling_instructions
1. **type**: enum(pass, fail_missing_one, fail_both)
2. **description**: 提供搬运说明，包括吊点位置图示。应有文字说明和示意图。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 搬运 handling 吊点 lifting point 施力点 图示 提升设备
8. **sample**: 说明书包含吊装图示和搬运步骤[S1.c40]。

### c41_installation_safety
1. **type**: boolean
2. **description**: 说明安装前的安全防护措施（如断电、锁定）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 安装 installation 安全防护 断电 锁定 lockout tagout
8. **sample**: 说明书要求"安装前切断电源并上锁挂牌"[S1.c41]。

### c42_unpacking_procedure
1. **type**: boolean
2. **description**: 提供拆包步骤。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 拆包 unpacking 开箱 步骤 流程
8. **sample**: 说明书包含开箱步骤描述[S1.c42]。

### c43_packaging_disposal
1. **type**: boolean
2. **description**: 说明如何安全处理包装材料（如回收、避免缠绕）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 包装材料 packaging 处理 disposal 回收 缠绕 安全
8. **sample**: 说明书说明包装材料可回收利用[S1.c43]。

### c44_assembly_installation_conditions
1. **type**: boolean
2. **description**: 描述装配和安装所需条件（空间、地基、环境）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 装配 assembly 安装条件 installation conditions 空间 地基 环境
8. **sample**: 说明书要求安装地面承重 ≥1000kg/m²[S1.c44]。

### c45_operation_maintenance_space
1. **type**: boolean
2. **description**: 给出操作和维护所需的空间尺寸（操作区域、维修通道）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 空间 space 操作区域 维修通道 尺寸 图示
8. **sample**: 说明书标注维修通道宽度 ≥800mm[S1.c45]。

### c46_environmental_conditions
1. **type**: enum(pass, fail, fail_no_temperature)
2. **description**: 列出允许的环境条件范围，至少给出温度范围。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 环境条件 environmental 温度 湿度 振动 允许范围
8. **sample**: 说明书给出工作温度 5-40°C[S1.c46]。

### c47_power_source_connection
1. **type**: enum(pass, fail_vague, fail_missing)
2. **description**: 说明如何连接电源、气源等，并给出防止过载的措施。应有连接图和过载保护说明。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 动力源连接 power connection 电源 气源 过载保护 连接图
8. **sample**: 说明书包含电气连接图和过载保护说明[S1.c47]。

### c48_waste_disposal
1. **type**: boolean
2. **description**: 提供废弃物（如废油、废料）的清除方法。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 废弃物 waste 清除 处置 废油 废料
8. **sample**: 说明书说明废油收集处理方法[S1.c48]。

### c49_user_protection_recommendations
1. **type**: boolean
2. **description**: 给用户提供保护措施建议（佩戴 PPE、设置安全区域等）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 保护措施保护建议 PPE 安全区域 用户
8. **sample**: 说明书建议设置安全围栏区域[S1.c49]。

### c50_anchoring_vibration
1. **type**: enum(pass, fail, na)
2. **description**: 说明是否需要固定/锚定，以及如何抑制噪声和振动。重型固定式机器必须要有。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 固定 anchoring 锚定 噪声抑制 振动抑制 重型设备
8. **sample**: 说明书要求地脚螺栓固定并加装减振垫[S1.c50]。

### c51_intended_use_repeat
1. **type**: boolean
2. **description**: 说明书的正文中是否再次（除首次说明外）重申或确认机械的预定使用。与 c10 不同，此处检查是否有重复强调。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 预定使用 intended use 用途 再次 重申
7. **depends_on**: c10
8. **sample**: 说明书在操作章节再次确认预定用途为"表面处理"[S1.c51]。

### c52_misuse_repeat
1. **type**: boolean
2. **description**: 说明书的正文中是否再次（除首次说明外）重申合理可预见的误用或禁止用途。与 c11 不同，此处检查是否有重复强调。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 合理可预见误用 foreseeable misuse 禁止用途 再次 重申
7. **depends_on**: c11
8. **sample**: 说明书在维护章节再次列出禁止用途[S1.c52]。

### c53_detailed_description_components
1. **type**: boolean
2. **description**: 描述机器各部件的功能和必须的防护装置，应有全面描述。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 详细说明 detailed description 配件 accessories 防护装置 guards 部件功能
8. **sample**: 说明书描述各部件功能和防护装置[S1.c53]。

### c54_diagrams_safety_symbols
1. **type**: enum(pass, fail, ind_unreadable)
2. **description**: 包含图表，特别是安全符号的图解。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 图表 diagrams 安全符号 safety symbols 图解标识 图示
8. **sample**: 说明书包含安全标识图解[S1.c54]。

### c55_manual_controls
1. **type**: boolean
2. **description**: 说明手动控制器（按钮、手柄）的功能和操作方法。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 手动控制器 manual controls 按钮 手柄 功能 操作方法
8. **sample**: 说明书说明各按钮功能[S1.c55]。

### c56_setting_adjustment
1. **type**: boolean
2. **description**: 说明设定和调整步骤。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 设定 setting 调整 adjustment 设置 参数
8. **sample**: 说明书包含参数设定步骤[S1.c56]。

### c57_mode_selection_commissioning_safety
1. **type**: enum(pass, fail_partial, fail_missing)
2. **description**: 说明不同模式的选择方法和调试运行时的安全注意事项。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 模式选择 mode selection 调试 commissioning 安全注意 运行模式
8. **sample**: 说明书说明手动/自动模式切换及调试安全注意事项[S1.c57]。

### c58_shutdown_modes
1. **type**: boolean
2. **description**: 描述正常停机、急停的方法和复位操作。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 停机 shutdown 正常停机 急停 emergency stop 复位 reset
8. **sample**: 说明书说明按下急停按钮后旋转复位[S1.c58]。

### c59_designer_uneliminated_risks
1. **type**: boolean
2. **description**: 说明设计者无法完全消除的风险（残留风险）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 设计者无法消除的风险 designer uneliminated risks 残留风险
8. **sample**: 说明书说明"无法完全消除夹伤风险"[S1.c59]。

### c60_special_application_risks
1. **type**: enum(pass, fail, na)
2. **description**: 说明使用特定配件或特殊应用时产生的风险及需要的专用防护装置。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 特殊应用 special application 配件 accessories 专用防护装置 风险
8. **sample**: 说明书说明使用打磨配件时需加装防护罩[S1.c60]。

### c61_fault_diagnosis_restart
1. **type**: enum(pass, fail_partial, fail_missing)
2. **description**: 提供故障诊断方法和维修后重新启动的程序，缺一不可。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 故障诊断 fault diagnosis 故障识别 定位 维修后重启 重新启动
8. **sample**: 说明书包含故障排查表和维修后重启步骤[S1.c61]。

### c62_ppe_training
1. **type**: boolean
2. **description**: 列出 PPE 和培训要求。
3. **clause**: MD Annex I §1.7.4
5. **attention**: PPE 培训 training 个体防护装备 操作培训
8. **sample**: 说明书要求操作前接受培训并佩戴 PPE[S1.c62]。

### c63_visual_audible_signals
1. **type**: boolean
2. **description**: 解释指示灯、蜂鸣器等信号的含义。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 可视信号 visual signals 可闻信号 audible signals 指示灯 蜂鸣器 含义
8. **sample**: 说明书解释红灯=故障、绿灯=运行中[S1.c63]。

### c64_waste_handling_operation
1. **type**: boolean
2. **description**: 说明使用过程中产生的废物处理方式。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 废物处理 waste 废弃 使用过程 处理方式
8. **sample**: 说明书说明废液收集处理方式[S1.c64]。

### c65_safety_function_checks
1. **type**: boolean
2. **description**: 说明需检查哪些安全功能以及检查频率（如每天、每周）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 安全功能检查 safety function check 性质 频次 每日 每周
8. **sample**: 说明书要求每日检查急停功能[S1.c65]。

### c66_health_critical_spare_parts_detail
1. **type**: enum(pass, fail_vague, fail_missing, na)
2. **description**: 备件技术条件影响健康安全时必须给出具体规格。区别于易损件清单，不得笼统说"原厂备件"。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 备件 spare parts 健康安全 技术条件 型号 材质 易损件
8. **sample**: 说明书列出安全相关备件滤芯型号[S1.c66]。

### c67_skilled_personnel_maintenance
1. **type**: boolean
2. **description**: 指明哪些维护工作只能由熟练/资质人员完成。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 熟练人员 skilled personnel 资质人员 qualified 维护工作 区分
8. **sample**: 说明书指明电气维修必须由持证电工完成[S1.c67]。

### c68_user_maintenance
1. **type**: boolean
2. **description**: 指明哪些维护工作可由操作者自行完成，必须明确指出完成身份。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 使用者维护 user maintenance 操作者 润滑 紧固 自行完成
8. **sample**: 说明书说明操作者可每日清洁和润滑[S1.c68]。

### c69_diagrams_maintenance
1. **type**: enum(pass, fail, ind_unreadable)
2. **description**: 提供维护所需的图样（如润滑图、电路图）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 图样 drawings 维护 maintenance 润滑图 电路图 示意图
8. **sample**: 说明书包含润滑图和电气原理图[S1.c69]。

### c70_troubleshooting
1. **type**: boolean
2. **description**: 提供常见故障现象、原因及解决方法（可列表）。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 故障排查 troubleshooting 常见问答 FAQ 测试程序 故障现象 原因 解决
8. **sample**: 说明书包含故障排查表[S1.c70]。

### c71_dismantling_decommissioning_disposal
1. **type**: boolean
2. **description**: 说明如何安全拆卸、停用及最终报废处理。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 拆卸 dismantling 停用 decommissioning 报废 disposal 安全拆卸
8. **sample**: 说明书说明拆卸步骤和环保报废处理[S1.c71]。

### c72_emergency_operation
1. **type**: boolean
2. **description**: 说明发生事故（伤人）或设备损坏时的应急操作步骤。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 紧急状态 emergency 事故 accident 损坏 操作方法 断电 停机
8. **sample**: 说明书规定"受伤后立即停机并拨打急救电话"[S1.c72]。

### c73_fire_fighting_equipment
1. **type**: enum(pass, fail, na)
2. **description**: 说明适用的灭火器类型（如 CO₂、干粉、水）。含电气部件的机器必须要有。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 消防 fire fighting 灭火器 类型 CO2 干粉 水 电气设备
8. **sample**: 说明书要求使用 CO₂灭火器[S1.c73]。

### c74_hazardous_substance_leak
1. **type**: enum(pass, fail, na)
2. **description**: 警告可能泄漏的有害物质（油、化学品等）及处理方法。
3. **clause**: MD Annex I §1.7.4
5. **attention**: 有害物质 hazardous substance 泄漏 leak 油 化学品 处理 警告
8. **sample**: 说明书警告化学品泄漏处理方法[S1.c74]。

## Red Lines

- ❌ 不得在 OCR 识别质量不足时直接判定 F — 应判 IND 并添加【OCR提醒】
- ❌ 不得将公司宣传性描述（例如"高效稳定"）直接作为预定使用的判定依据
- ❌ 不得将封面信息混同于说明书正文内容进行判定

## Lessons Learnt

(System-maintained area, initially empty.)

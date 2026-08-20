"use client";

import { useState } from "react";
import { setLang } from "@/lib/compliance/i18n";

const L: Record<string, { en: string; zh: string }> = {
  title: { en: "Service Disclosure", zh: "服务透明度公开" },
  updated: { en: "Last updated: July 23, 2026", zh: "最后更新：2026年7月23日" },
  s1: { en: "1. Service Purpose, Scope & Users", zh: "1. 服务用途、范围与适用人群" },
  s1Purpose: { en: "Purpose: AI-powered compliance assessment — assists organizations in auditing products and documents against regulatory standards (MDR, EU AI Act, GB standards, GDPR, etc.).", zh: "用途：基于AI的合规评估 — 协助组织对产品和文档进行法规标准（MDR、EU AI Act、GB标准、GDPR等）合规审核。" },
  s1Users: { en: "Applicable users: Registered professionals & enterprises (compliance officers, legal, product managers). Not for consumers or minors under 14.", zh: "适用人群：注册专业人士及企业（合规官、法律人士、产品经理）。不适用于消费者或14岁以下未成年人。" },
  s1Scenarios: { en: "Applicable scenarios: Pre-compliance document preparation, regulatory gap analysis, internal audit support, supplier compliance verification.", zh: "适用场合：预合规文档准备、法规差距分析、内部审计辅助、供应商合规验证。" },
  s1Limits: { en: "Limitations: LLM outputs may contain errors or omissions. Always verify critical compliance decisions with a qualified professional.", zh: "局限性：大语言模型输出可能存在错误或遗漏。关键合规决策应由专业人士验证。" },
  s2: { en: "2. Model & Algorithm Information", zh: "2. 模型与算法信息" },
  s2Model: { en: "clausr.ai uses large language models (LLMs) via third-party API providers. Default: DeepSeek (deepseek-v4-flash). Model version is configurable per tenant organization.", zh: "clausr.ai 通过第三方API使用大语言模型。默认：DeepSeek (deepseek-v4-flash)。模型版本按租户组织配置。" },
  s3: { en: "3. AI Content Labeling", zh: "3. AI 内容标识" },
  s3Body: { en: "Per GB 45438-2025: all AI-generated text carries a clausr.ai badge. Exported DOCX files include 5 metadata elements (generation tag, provider, content ID, propagation provider, propagation ID) plus an invisible digital watermark in content data.", zh: "依据 GB 45438-2025：所有AI生成文本标注 clausr.ai 标识。导出DOCX文件包含5项元数据（生成标签、提供者、内容ID、传播提供者、传播ID）及内容数据中的隐形数字水印。" },
  s4: { en: "4. Data Processing & Privacy", zh: "4. 数据处理与隐私" },
  s4Body: { en: "Messages and uploaded files are sent to third-party LLM providers solely for generating compliance assessments. Not used for model training or fine-tuning. Data retention is configurable per organization (default 90 days). Data deletion requests: privacy@clausr.ai.", zh: "消息和上传文件仅发送至第三方LLM提供者用于生成合规评估。不用于模型训练或微调。数据保留期按组织配置（默认90天）。删除请求：privacy@clausr.ai。" },
  s5: { en: "5. Complaint & Reporting", zh: "5. 投诉与举报" },
  s5Body: { en: "Contact page or tianjierong@inspectorai.cn. Acknowledged within 48 hours.", zh: "联系页面或 tianjierong@inspectorai.cn。48小时内确认。" },
  s6: { en: "6. API Transparency", zh: "6. API 透明度" },
  s6Body: { en: "Programmatic API users: the same transparency information in sections 1-5 applies. API documentation is available to authorized integration partners. Contact api@clausr.ai for details.", zh: "可编程接口用户：第1-5节相同的透明度信息同样适用。API文档面向授权集成合作伙伴提供。详情请联系 api@clausr.ai。" },
  back: { en: "← Back", zh: "← 返回" },
};

export default function DisclosurePage() {
  const [lang, setLangState] = useState("zh");

  const toggleLang = () => {
    const next = lang === "zh" ? "en" : "zh";
    setLangState(next);
    setLang(next as "en" | "zh");
  };

  const l = (k: string) => {
    const e = L[k];
    return e ? e[lang as keyof typeof e] ?? e.zh : k;
  };

  const sec = (title: string, ...bodies: string[]) => (
    <div style={{ marginBottom: 12, padding: "14px 18px", borderRadius: 8, border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--color-text-heading)" }}>{title}</div>
      {bodies.map((b, i) => <p key={i} style={{ fontSize: 14, lineHeight: 1.6, color: "var(--color-text-body)", margin: "3px 0" }}>{b}</p>)}
    </div>
  );

  return (
    <div style={{ maxWidth: 640, padding: "12px 20px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => window.history.back()}
          style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--color-border-default)", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--color-text-muted)" }}>
          {l("back")}
        </button>
        <button onClick={toggleLang}
          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--color-border-default)", background: "var(--color-bg-dark)", cursor: "pointer", fontSize: 10, fontWeight: 600, color: "var(--color-text-muted)" }}>
          {lang === "zh" ? "EN" : "中文"}
        </button>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 2px", color: "var(--color-text-heading)" }}>{l("title")}</h1>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>{l("updated")}</p>
      {sec(l("s1"), l("s1Purpose"), l("s1Users"), l("s1Scenarios"), l("s1Limits"))}
      {sec(l("s2"), l("s2Model"))}
      {sec(l("s3"), l("s3Body"))}
      {sec(l("s4"), l("s4Body"))}
      {sec(l("s5"), l("s5Body"))}
      {sec(l("s6"), l("s6Body"))}
    </div>
  );
}

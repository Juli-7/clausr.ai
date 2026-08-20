"use client";

import { useState } from "react";
import { setLang } from "@/lib/compliance/i18n";

const L: Record<string, { en: string; zh: string }> = {
  title: { en: "Contact & Complaints", zh: "联系与投诉" },
  sub: { en: "Submit a complaint, report a concern, or send feedback.", zh: "提交投诉、报告问题或发送反馈。" },
  name: { en: "Name", zh: "姓名" },
  email: { en: "Email", zh: "邮箱" },
  type: { en: "Type", zh: "类型" },
  typeC: { en: "Complaint", zh: "投诉" },
  typeR: { en: "Report", zh: "举报" },
  typeF: { en: "Feedback", zh: "反馈" },
  msg: { en: "Message", zh: "留言" },
  submit: { en: "Submit", zh: "提交" },
  sending: { en: "Sending...", zh: "发送中..." },
  suc: { en: "Submitted. We will respond within 48 hours.", zh: "已提交。我们将在48小时内回复。" },
  err: { en: "Submission failed. Try again or email tianjierong@inspectorai.cn.", zh: "提交失败。请重试或发送邮件至 tianjierong@inspectorai.cn。" },
  back: { en: "← Back", zh: "← 返回" },
};

export default function ContactPage() {
  const [lang, setLangState] = useState("zh");

  const toggleLang = () => {
    const next = lang === "zh" ? "en" : "zh";
    setLangState(next);
    setLang(next as "en" | "zh");
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"complaint" | "report" | "feedback">("complaint");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  const l = (k: string) => {
    const e = L[k];
    return e ? e[lang as keyof typeof e] ?? e.zh : k;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/complaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, type, message }),
      });
      if (res.ok) { setStatus("success"); setName(""); setEmail(""); setMessage(""); }
      else { setStatus("error"); }
    } catch { setStatus("error"); }
  };

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
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>{l("sub")}</p>

      {status === "success" && <div style={{ padding: "10px 14px", borderRadius: 6, marginBottom: 12, background: "var(--color-success-bg)", color: "var(--color-success)", fontSize: 13, fontWeight: 500 }}>{l("suc")}</div>}
      {status === "error" && <div style={{ padding: "10px 14px", borderRadius: 6, marginBottom: 12, background: "var(--color-error-bg)", color: "var(--color-error)", fontSize: 13, fontWeight: 500 }}>{l("err")}</div>}

      <form onSubmit={handleSubmit} style={{ padding: "14px 18px", borderRadius: 8, border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 3, color: "var(--color-text-heading)" }}>{l("name")}</label>
            <input style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 6, border: "1px solid var(--color-border-input)", background: "var(--color-bg-input)", color: "var(--color-text-body)", boxSizing: "border-box" }} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 3, color: "var(--color-text-heading)" }}>{l("email")}</label>
            <input style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 6, border: "1px solid var(--color-border-input)", background: "var(--color-bg-input)", color: "var(--color-text-body)", boxSizing: "border-box" }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 3, color: "var(--color-text-heading)" }}>{l("type")}</label>
            <select style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 6, border: "1px solid var(--color-border-input)", background: "var(--color-bg-input)", color: "var(--color-text-body)", boxSizing: "border-box" }} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="complaint">{l("typeC")}</option>
              <option value="report">{l("typeR")}</option>
              <option value="feedback">{l("typeF")}</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 3, color: "var(--color-text-heading)" }}>{l("msg")}</label>
            <textarea style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 6, border: "1px solid var(--color-border-input)", background: "var(--color-bg-input)", color: "var(--color-text-body)", boxSizing: "border-box", minHeight: 100, resize: "vertical" }} value={message} onChange={(e) => setMessage(e.target.value)} required />
          </div>
          <button type="submit" disabled={status === "sending"}
            style={{
              padding: "9px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
              background: status === "sending" ? "var(--color-accent-blue-bg)" : "var(--color-accent-blue)",
              color: status === "sending" ? "var(--color-accent-blue)" : "#fff",
              alignSelf: "flex-start",
            }}>
            {status === "sending" ? l("sending") : l("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  function startCountdown(sec: number) {
    setCountdown(sec);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendCode() {
    if (!phone || phone.length < 10) {
      setError("Please enter a valid phone number");
      return;
    }

    setSendingCode(true);
    setError("");

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to send code");
      }

      startCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "phone", phone, code, name }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Registration failed");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--color-bg-primary)" }}>
      <div
        className="w-full max-w-sm p-8 rounded-xl"
        style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
      >
        <h1 className="text-xl font-semibold mb-1" style={{ color: "var(--color-accent-blue)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" }}>
          摇光合规助手 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>clausr.ai</span>
        </h1>
        <p className="text-base tracking-wide leading-relaxed mb-6 font-semibold" style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif" }}>
          Create your account
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-text-body)" }}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "var(--color-bg-dark)",
                border: "1px solid var(--color-border-input)",
                color: "var(--color-text-body)",
              }}
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-text-body)" }}>
              Phone Number
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="13800138000"
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: "var(--color-bg-dark)",
                  border: "1px solid var(--color-border-input)",
                  color: "var(--color-text-body)",
                }}
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode || countdown > 0}
                className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer border-none whitespace-nowrap transition-opacity disabled:opacity-50"
                style={{
                  background: "var(--color-accent-blue)",
                  color: "#fff",
                }}
              >
                {sendingCode ? "Sending..." : countdown > 0 ? `${countdown}s` : "Send code"}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-text-body)" }}>
              Verification Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              placeholder="6-digit code"
              maxLength={6}
              inputMode="numeric"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "var(--color-bg-dark)",
                border: "1px solid var(--color-border-input)",
                color: "var(--color-text-body)",
              }}
            />
          </div>

          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer border-none transition-opacity disabled:opacity-50"
            style={{
              background: "var(--color-accent-blue)",
              color: "#fff",
            }}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>

          <div>
            <p className="text-xs text-center" style={{ color: "var(--color-text-body)" }}>
              Already have an account?{" "}
              <Link href="/login" className="underline">
                Sign in
              </Link>
            </p>
            <div className="flex justify-center gap-3 mt-3" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              <Link href="/terms" className="underline">Terms</Link>
              <Link href="/disclosure" className="underline">Disclosure</Link>
              <Link href="/contact" className="underline">Contact</Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

type LoginMode = "code" | "password";

export function LoginForm() {
  const [mode, setMode] = useState<LoginMode>("code");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notRegistered, setNotRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const router = useRouter();

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
    setNotRegistered(false);

    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, scene: "登录验证码" }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.code === "not_registered") {
          setNotRegistered(true);
          return;
        }
        throw new Error(data.error || "Failed to send code");
      }

      startCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Login failed");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Login failed");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
        <p className="text-base tracking-wide leading-relaxed mb-10 font-semibold" style={{ color: "var(--color-text-header)", fontFamily: "'Instrument Serif', Georgia, serif" }}>
          Turn expertise into a manageable digital asset
        </p>

        <div className="flex mb-6 rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border-input)" }}>
          <button
            type="button"
            onClick={() => { setMode("code"); setError(""); }}
            className="flex-1 py-2 text-sm font-medium cursor-pointer border-none transition-colors"
            style={{
              background: mode === "code" ? "var(--color-accent-blue)" : "var(--color-bg-dark)",
              color: mode === "code" ? "#fff" : "var(--color-text-body)",
            }}
          >
            Phone code
          </button>
          <button
            type="button"
            onClick={() => { setMode("password"); setError(""); }}
            className="flex-1 py-2 text-sm font-medium cursor-pointer border-none transition-colors"
            style={{
              background: mode === "password" ? "var(--color-accent-blue)" : "var(--color-bg-dark)",
              color: mode === "password" ? "#fff" : "var(--color-text-body)",
            }}
          >
            Password
          </button>
        </div>

        <div className="mb-6" style={{ height: 1, background: "var(--color-border-default)", opacity: 0.3 }} />

        {mode === "code" ? (
          <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4">
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

            {notRegistered ? (
              <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                Phone number not registered.{" "}
                <Link href="/register" className="underline" style={{ color: "var(--color-accent-blue)" }}>
                  Sign up here
                </Link>
              </p>
            ) : error && (
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
              {loading ? "Signing in..." : "Sign in with code"}
            </button>

            <div>
              <p className="text-xs text-center" style={{ color: "var(--color-text-body)" }}>
                Don&apos;t have an account?{" "}
                <Link href="/register" className="underline">
                  Sign up
                </Link>
              </p>
              <div className="flex justify-center gap-3 mt-3" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                <Link href="/terms" className="underline">Terms</Link>
                <Link href="/disclosure" className="underline">Disclosure</Link>
                <Link href="/contact" className="underline">Contact</Link>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-text-body)" }}>
                Email / Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none pr-10"
                  style={{
                    background: "var(--color-bg-dark)",
                    border: "1px solid var(--color-border-input)",
                    color: "var(--color-text-body)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent p-1"
                  style={{ color: "var(--color-text-body)" }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div>
              <p className="text-xs text-center" style={{ color: "var(--color-text-body)" }}>
                Don&apos;t have an account?{" "}
                <Link href="/register" className="underline">
                  Sign up
                </Link>
              </p>
              <div className="flex justify-center gap-3 mt-3" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                <Link href="/terms" className="underline">Terms</Link>
                <Link href="/disclosure" className="underline">Disclosure</Link>
                <Link href="/contact" className="underline">Contact</Link>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, ShieldCheck } from "lucide-react"
import { login } from "@/lib/auth"
import { PRODUCT_NAME } from "@/lib/brand"
import { Wordmark } from "@/components/Wordmark"
import { ThemeToggle } from "@/components/ThemeToggle"
import SentinelScene, { type SceneMode } from "@/components/dark/SentinelScene"
import "./login.css"

type Focus = "none" | "email" | "password"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const BUBBLE: Record<SceneMode, string> = {
  idle: "Welcome back. Ready to investigate?",
  email: "Enter your work email.",
  password: "Your password stays private.",
  peek: "Your password is visible. Check your surroundings.",
  loading: "Verifying your credentials…",
  error: "Those details don't match. Please try again.",
  success: "Signed in. Opening your workspace…",
  sleep: "Still here whenever you are ready.",
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [succeeded, setSucceeded] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [focus, setFocus] = useState<Focus>("none")
  const [noWebGL, setNoWebGL] = useState(false)
  const router = useRouter()
  const navTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(navTimer.current), [])

  const mode: SceneMode = succeeded
    ? "success"
    : isLoading
      ? "loading"
      : error
        ? "error"
        : focus === "password"
          ? showPassword
            ? "peek"
            : "password"
          : focus === "email"
            ? "email"
            : "idle"

  // Lesson-style progress: one step per completed field.
  const emailValid = EMAIL_RE.test(email.trim())
  const progress = succeeded ? 100 : (emailValid ? 50 : 0) + (password.length > 0 ? 50 : 0)
  const canSubmit = emailValid && password.length > 0 && !isLoading && !succeeded

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setIsLoading(true)
    try {
      const { must_reset_password } = await login(email.trim(), password, otp)
      setIsLoading(false)
      setSucceeded(true)
      navTimer.current = setTimeout(() => router.push(must_reset_password ? "/reset-password" : "/"), 1400)
    } catch (err) {
      setIsLoading(false)
      setError(err instanceof Error ? err.message : "Invalid credentials")
    }
  }

  return (
    <div className="lg-root">
      <section className="lg-scene" aria-label={`${PRODUCT_NAME} assistant`}>
        <div className="lg-wordmark">
          <Wordmark size={30} href={null} />
        </div>
        <div key={mode} className="lg-bubble" role="status" aria-live="polite">
          {BUBBLE[mode]}
        </div>
        {noWebGL ? <div className="lg-fallback" aria-hidden /> : <SentinelScene mode={mode} onUnsupported={() => setNoWebGL(true)} className="lg-canvas" />}
      </section>

      <main className="lg-panel">
        <div className="lg-top">
          <div className="lg-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="lg-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <ThemeToggle variant="icon" />
        </div>

        <form onSubmit={handleSubmit} className="lg-form" noValidate>
          <h1>Sign in</h1>
          <p className="lg-sub">Access the threat intelligence workspace.</p>

          <label className="lg-field">
            <span className="sr-only">Email</span>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
              onFocus={() => setFocus("email")}
              onBlur={() => setFocus("none")}
              autoComplete="email"
              autoFocus
              placeholder="Work email"
              required
            />
          </label>

          <label className="lg-field">
            <span className="sr-only">Password</span>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              onFocus={() => setFocus("password")}
              onBlur={() => setFocus("none")}
              autoComplete="current-password"
              placeholder="Password"
              required
              style={{ paddingRight: 56 }}
            />
            <button
              type="button"
              className="lg-eye"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={20} strokeWidth={2.6} /> : <Eye size={20} strokeWidth={2.6} />}
            </button>
          </label>

          <label className="lg-field">
            <span className="text-xs text-[var(--text-muted)]">Authenticator or recovery code (if enabled)</span>
            <input value={otp} onChange={(event) => setOtp(event.target.value)} autoComplete="one-time-code" placeholder="6-digit code" maxLength={24} aria-label="Authenticator or recovery code" />
          </label>

          {error && (
            <div className="lg-error" role="alert">
              <span className="lg-error-x" aria-hidden>
                ✕
              </span>
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn-dw lg-cta" disabled={!canSubmit}>
            {isLoading ? <span className="lg-spinner" aria-label="Signing in" /> : succeeded ? "Signed in" : "Sign in"}
          </button>

          <p className="lg-foot">
            <ShieldCheck size={16} strokeWidth={2.8} aria-hidden /> Authorized personnel only · Sessions are monitored
          </p>
        </form>
      </main>
    </div>
  )
}

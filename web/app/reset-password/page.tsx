"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { resetPassword } from "@/lib/auth"
import { Wordmark } from "@/components/Wordmark"

export default function ResetPasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const hasMinLength = newPassword.length >= 8
  const hasLetter = /[a-zA-Z]/.test(newPassword)
  const hasDigit = /[0-9]/.test(newPassword)
  const hasAllRequirements = hasMinLength && hasLetter && hasDigit
  const matchesConfirmation = confirmPassword.length > 0 && newPassword === confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!hasAllRequirements) {
      setError("Password does not meet requirements")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match")
      return
    }

    setIsLoading(true)
    try {
      await resetPassword(currentPassword, newPassword, confirmPassword)
      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)] p-4 relative overflow-hidden">

      <div className="w-full max-w-[400px] relative">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mb-8"><Wordmark size={34} href={null} /></div>
        </div>

        <div className="dw-card p-8 animate-in fade-in zoom-in-95 duration-500">
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-2 text-[var(--warning)] text-[16px] font-extrabold">
              <span>⚠</span>
              <span>Password change required</span>
            </div>
            <p className="text-[var(--text-secondary)] text-sm font-bold">
              Set a new secure password before continuing.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="currentPassword"
                className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] ml-1"
              >
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="dw-input"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="newPassword"
                className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] ml-1"
              >
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="dw-input"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] ml-1"
              >
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="dw-input"
              />
            </div>

            <div className="py-2 space-y-1">
              <p className="text-[var(--text-secondary)] text-[12px] font-extrabold leading-relaxed">
                Requirements:
              </p>
              <ul className="space-y-0.5 text-[13px] font-bold">
                <li className={hasMinLength ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"}>
                  {hasMinLength ? "✓" : "○"} 8+ characters
                </li>
                <li className={hasLetter ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"}>
                  {hasLetter ? "✓" : "○"} at least one letter
                </li>
                <li className={hasDigit ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"}>
                  {hasDigit ? "✓" : "○"} at least one number
                </li>
                <li className={matchesConfirmation ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"}>
                  {matchesConfirmation ? "✓" : "○"} passwords match
                </li>
              </ul>
            </div>

            {error && (
              <div className="rounded-xl bg-[var(--danger-dim)] px-3 py-2.5 text-[13px] font-extrabold text-[var(--danger)] animate-in fade-in slide-in-from-top-2">
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !hasAllRequirements}
              className="btn-dw w-full !min-h-12"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-[3px] border-[var(--text-inverse)]/50 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Set New Password <span className="text-lg">→</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

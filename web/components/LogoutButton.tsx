"use client"
import { useState } from "react"
import { LogOut } from "lucide-react"
import { logout } from "@/lib/auth"
export function LogoutButton({ block = false }: { block?: boolean } = {}) {
  const [error, setError] = useState("")
  return (
    <span className={block ? "flex flex-col gap-1" : "inline-flex items-center gap-2"}>
      <button
        className={`btn-dw btn-dw-ghost btn-dw-sm ${block ? "w-full" : ""}`}
        onClick={() => logout().catch(() => setError("Logout failed; please retry"))}
      >
        <LogOut className="h-4 w-4" strokeWidth={2.6} aria-hidden />
        Log out
      </button>
      {error && <span role="alert" className="text-xs font-bold text-[var(--danger)]">{error}</span>}
    </span>
  )
}

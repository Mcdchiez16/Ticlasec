"use client";
import { useCallback, useEffect, useState } from "react";

export interface Channel {
  provider: "telegram" | "whatsapp";
  configured: boolean;
  connected: boolean;
  missing: string[];
  identity: string | null;
  model: string | null;
  connection_mode?: "qr" | "cloud" | "bot";
  connection_status?: string;
  has_session?: boolean;
}

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/channels", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load channel connections.");
      const data = await response.json();
      setChannels(Array.isArray(data.items) ? data.items : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Channels unavailable.");
      setChannels([]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { channels, error, loading, refresh };
}

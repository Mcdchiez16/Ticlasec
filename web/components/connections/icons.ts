import { Bug, CircleDot, ClipboardList, Globe, KeyRound, Mail, MessagesSquare, Server, ShieldAlert, UserRound, Wallet, type LucideIcon } from "lucide-react";
import type { EntityCategoryKey } from "@/lib/types/investigation";

export const CATEGORY_ICON: Record<EntityCategoryKey, LucideIcon> = {
  THREAT_ACTOR: UserRound,
  WALLET: Wallet,
  MALWARE: Bug,
  FORUM: MessagesSquare,
  C2_SERVER: Server,
  CVE: ShieldAlert,
  PASTE_URL: ClipboardList,
  ONION_URL: Globe,
  EMAIL: Mail,
  PGP_KEY: KeyRound,
  OTHER: CircleDot,
};

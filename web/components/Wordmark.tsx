import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PRODUCT_NAME } from "@/lib/brand";

/** `size` is a nominal text size in px; the logo is scaled to match. */
export function Wordmark({ size = 28, href = "/", tone = "default" }: { size?: number; href?: string | null; tone?: "default" | "light" }) {
  const logo = <Logo height={Math.round(size * 1.5)} tone={tone} title={PRODUCT_NAME} />;
  return href ? (
    <Link href={href} aria-label={`${PRODUCT_NAME} home`} className="inline-flex items-center transition-opacity hover:opacity-85">
      {logo}
    </Link>
  ) : (
    logo
  );
}

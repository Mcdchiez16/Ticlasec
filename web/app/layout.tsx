import type { Metadata } from "next";
import "./globals.css";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcutsProvider";
import { PRODUCT_LONG_NAME, PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — Global Threat Intelligence`,
  description: `${PRODUCT_LONG_NAME}: evidence-grounded dark web intelligence with global and regional scopes.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("ticlasec-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="font-sans antialiased text-[var(--text-primary)] bg-[var(--bg-void)]"
        style={{
          "--font-display": '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
          "--font-body": '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
          "--font-mono": '"SFMono-Regular", Menlo, Monaco, Consolas, ui-monospace, monospace',
        } as React.CSSProperties}
      >
        <KeyboardShortcutsProvider>
          {children}
        </KeyboardShortcutsProvider>
      </body>
    </html>
  );
}

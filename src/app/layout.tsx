import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spoons",
  description:
    "Some Spoon Game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className="antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans"
      >
        <main>{children}</main>
      </body>
    </html>
  );
}


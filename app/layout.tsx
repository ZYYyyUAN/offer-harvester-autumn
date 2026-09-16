import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OFFER 收割机 · 私人求职工作台",
  description: "简历版本、岗位投递、面试复盘与 OFFER 决策的一站式私人工作台。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

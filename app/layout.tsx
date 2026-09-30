import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PhotoPick — Preview & duyệt ảnh",
  description: "Xem album, chọn và ghi chú ảnh của bạn.",
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
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}

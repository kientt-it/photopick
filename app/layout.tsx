import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chọn Ảnh — Preview & duyệt ảnh",
  description: "Xem, chọn và ghi chú ảnh trong album của bạn.",
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

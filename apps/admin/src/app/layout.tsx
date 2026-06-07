import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shelter Accord — Адмін',
  description: 'Панель адміністрування гри Shelter Accord',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}

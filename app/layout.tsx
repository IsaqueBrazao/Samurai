import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Load, Aim... Shoot! - Samurai Duel',
  description: 'Port web do aclamado jogo indie de duelo samurai: Load, Aim... Shoot! Teste seus reflexos, dispare na hora certa e defenda com a katana.',
  openGraph: {
    title: 'Load, Aim... Shoot! - Samurai Duel',
    description: 'Port web do aclamado jogo indie de duelo samurai: Load, Aim... Shoot! Teste seus reflexos, dispare na hora certa e defenda com a katana.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Load, Aim... Shoot! - Samurai Duel',
    description: 'Port web do aclamado jogo indie de duelo samurai: Load, Aim... Shoot! Teste seus reflexos, dispare na hora certa e defenda com a katana.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

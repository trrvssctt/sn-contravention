import type { Metadata } from 'next';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/800.css';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'SEN Contraventions · Administration',
  description: 'Pilotage national des contraventions routières du Sénégal',
  icons: { icon: '/flag-senegal.svg' },
};

// Polices auto-hébergées (@fontsource) : aucune dépendance à Google Fonts au runtime.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

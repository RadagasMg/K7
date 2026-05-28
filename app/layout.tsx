import type {Metadata, Viewport} from 'next';
import './globals.css'; // Global styles
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/ThemeProvider';

export const viewport: Viewport = {
  themeColor: '#1e3a8a',
};

export const metadata: Metadata = {
  title: 'K7',
  description: 'Plateforme de suivi logistique',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'K7',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors duration-200">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            {children}
            <Toaster richColors position="top-center" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

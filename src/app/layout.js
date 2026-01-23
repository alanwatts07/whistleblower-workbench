import './globals.css';
import Navbar from '../components/Navbar';

export const metadata = {
  title: "Whistleblower's Workbench | False Claims Act Intelligence",
  description: 'Investigative dashboard for identifying potential qui tam opportunities. Analyzes federal contracts, healthcare provider payments, and exclusion databases with ML-powered fraud detection.',
  keywords: ['False Claims Act', 'qui tam', 'fraud detection', 'healthcare fraud', 'government contracts', 'whistleblower'],
  authors: [{ name: 'Alan Watts' }],
  openGraph: {
    title: "Whistleblower's Workbench",
    description: 'False Claims Act Intelligence Platform - Analyze federal spending for fraud indicators with ML-powered risk scoring.',
    url: 'https://false-claims-suite.vercel.app',
    siteName: "Whistleblower's Workbench",
    images: [
      {
        url: 'https://false-claims-suite.vercel.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Whistleblower Workbench Dashboard',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Whistleblower's Workbench",
    description: 'False Claims Act Intelligence Platform - ML-powered fraud detection for federal spending.',
    images: ['https://false-claims-suite.vercel.app/og-image.png'],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="container" style={{ paddingTop: '24px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}

import './globals.css';
import Navbar from '../components/Navbar';

export const metadata = {
  title: "Whistleblower's Workbench",
  description: 'False Claims Act Fraud Detection Suite',
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

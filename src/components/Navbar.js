import Link from 'next/link';

export default function Navbar() {
    return (
        <nav className="glass-header">
            <div className="container" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <Link href="/" style={{ textDecoration: 'none', color: 'var(--foreground)', fontWeight: 'bold', fontSize: '1.2rem' }}>
                    Whistleblower's<span style={{ color: 'var(--primary)' }}>Workbench</span>
                </Link>
                <div style={{ display: 'flex', gap: '24px' }}>
                    <Link href="/" style={{ color: 'var(--foreground)', textDecoration: 'none' }}>Dashboard</Link>
                    <Link href="/ma-contracts" style={{ color: 'var(--foreground)', textDecoration: 'none' }}>MA Contracts</Link>
                    <Link href="/contractor-search" style={{ color: 'var(--foreground)', textDecoration: 'none' }}>Vetting</Link>
                    <Link href="/healthcare-fraud" style={{ color: 'var(--foreground)', textDecoration: 'none' }}>Healthcare</Link>
                </div>
            </div>
        </nav>
    );
}

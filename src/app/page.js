'use client';

import { useState, useEffect } from 'react';
import { getRecentMASettlements, getMAHighRiskPatterns } from '../actions/masshealth';

export default function Home() {
  const [settlements, setSettlements] = useState(null);
  const [riskPatterns, setRiskPatterns] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [settlementsData, patternsData] = await Promise.all([
          getRecentMASettlements(),
          getMAHighRiskPatterns(),
        ]);
        if (settlementsData.success) setSettlements(settlementsData);
        if (patternsData.success) setRiskPatterns(patternsData);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const formatCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toLocaleString()}`;
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'High': return 'var(--accent)';
      case 'Medium': return '#ff9900';
      case 'Low': return 'var(--primary)';
      default: return 'var(--foreground)';
    }
  };

  return (
    <div>
      <section style={{ textAlign: 'center', padding: '60px 0' }}>
        <h1 style={{ marginBottom: '16px' }}>False Claims Act Intelligence</h1>
        <p style={{ fontSize: '1.2rem', color: '#888', maxWidth: '700px', margin: '0 auto 32px' }}>
          Leverage public data to identify potential qui tam opportunities under the False Claims Act.
          Focus on Medicaid healthcare fraud and government contractor violations.
        </p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/contractor-search" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Vet Government Contractors
          </a>
          <a href="/healthcare-fraud" className="btn" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)', textDecoration: 'none' }}>
            Analyze Healthcare Providers
          </a>
        </div>
      </section>

      {/* Stats Row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="premium-card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>FY2025 FCA Recoveries</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>$6.8B</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Highest in FCA history</div>
        </div>
        <div className="premium-card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>Healthcare Fraud Share</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>$5.7B</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>84% of total recoveries</div>
        </div>
        <div className="premium-card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>Qui Tam Filings</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>1,297</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Record whistleblower cases</div>
        </div>
        <div className="premium-card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: '0.9rem', marginBottom: '8px' }}>Whistleblower Share</div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>15-30%</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Of recovered funds</div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', padding: '24px 0' }}>
        {/* Recent Massachusetts Settlements */}
        <div className="premium-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>MA Recent Settlements</h3>
            {settlements && (
              <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                {formatCurrency(settlements.totalRecovered)}
              </span>
            )}
          </div>
          {loading ? (
            <p style={{ color: '#888' }}>Loading...</p>
          ) : settlements ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {settlements.settlements.slice(0, 5).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                  <div>
                    <div style={{ fontWeight: '500' }}>{item.defendant.substring(0, 30)}</div>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}>{item.type}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{formatCurrency(item.amount)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>{item.date}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#888' }}>Failed to load settlements</p>
          )}
          <a href="/healthcare-fraud" style={{ display: 'block', marginTop: '16px', color: 'var(--primary)', textDecoration: 'none', fontSize: '0.9rem' }}>
            View all Massachusetts data →
          </a>
        </div>

        {/* High Risk Provider Types */}
        <div className="premium-card">
          <h3 style={{ marginTop: 0 }}>High-Risk Provider Types</h3>
          {loading ? (
            <p style={{ color: '#888' }}>Loading...</p>
          ) : riskPatterns ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {riskPatterns.highRiskProviderTypes.slice(0, 5).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                  <span>{item.type}</span>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: getRiskColor(item.riskLevel),
                    color: item.riskLevel === 'Low' ? '#000' : '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                  }}>
                    {item.riskLevel}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#888' }}>Failed to load risk patterns</p>
          )}
        </div>

        {/* Data Sources */}
        <div className="premium-card">
          <h3 style={{ marginTop: 0 }}>Connected Data Sources</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {[
              { name: 'USASpending.gov', status: 'Active', desc: 'Federal contract awards' },
              { name: 'CMS Open Payments', status: 'Active', desc: 'Physician payments' },
              { name: 'SAM.gov Exclusions', status: 'Link', desc: 'Debarment database' },
              { name: 'MassHealth Exclusions', status: 'Link', desc: 'MA provider exclusions' },
              { name: 'HHS OIG LEIE', status: 'Link', desc: 'Federal exclusions' },
            ].map((source, i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: '500' }}>{source.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>{source.desc}</div>
                </div>
                <span style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  background: source.status === 'Active' ? 'var(--primary)' : 'var(--surface)',
                  color: source.status === 'Active' ? '#000' : '#888',
                  fontSize: '0.75rem',
                  border: source.status !== 'Active' ? '1px solid var(--border)' : 'none',
                }}>
                  {source.status}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Investigation Checklist */}
        <div className="premium-card">
          <h3 style={{ marginTop: 0 }}>Investigation Checklist</h3>
          <div style={{ color: '#888', lineHeight: 1.8 }}>
            <div style={{ marginBottom: '16px' }}>
              <strong style={{ color: 'var(--foreground)' }}>Healthcare Providers</strong>
              <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                <li>Check Open Payments for pharma ties</li>
                <li>Verify exclusion status (OIG LEIE)</li>
                <li>Review MassHealth exclusions</li>
                <li>Analyze billing patterns vs peers</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: 'var(--foreground)' }}>Government Contractors</strong>
              <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                <li>Search USASpending award history</li>
                <li>Check SAM.gov exclusion status</li>
                <li>Look for award concentration</li>
                <li>Investigate rapid growth patterns</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Legal Disclaimer */}
      <section style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>
          <strong>Disclaimer:</strong> This tool provides public data analysis for research purposes.
          It does not constitute legal advice. Red flags and risk scores are algorithmic indicators
          and require human investigation to determine if actual fraud exists. Consult with a
          qualified attorney before filing any qui tam lawsuit under the False Claims Act.
        </p>
      </section>
    </div>
  );
}

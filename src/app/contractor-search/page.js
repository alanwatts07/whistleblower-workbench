'use client';

import { useState } from 'react';
import { searchContractorAwards, analyzeContractorRisk } from '../../actions/usaspending';
import { checkExclusionStatus } from '../../actions/sam';

export default function ContractorSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('MA');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [riskAnalysis, setRiskAnalysis] = useState(null);
  const [exclusionStatus, setExclusionStatus] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setRiskAnalysis(null);
    setExclusionStatus(null);

    try {
      // Run searches in parallel
      const [awardsResult, riskResult, exclusionResult] = await Promise.all([
        searchContractorAwards(searchTerm, {
          startDate: '2020-01-01',
          limit: 25,
        }),
        analyzeContractorRisk(searchTerm),
        checkExclusionStatus(searchTerm),
      ]);

      if (awardsResult.success) {
        setResults(awardsResult);
      } else {
        setError(awardsResult.error);
      }

      if (riskResult.success) {
        setRiskAnalysis(riskResult);
      }

      if (exclusionResult.success) {
        setExclusionStatus(exclusionResult);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
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
      <h1>Contractor Vetting</h1>
      <p style={{ color: '#888', marginBottom: '24px' }}>
        Search federal contract awards and check for False Claims Act red flags
      </p>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="premium-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Enter contractor name (e.g., Boeing, Raytheon)"
            style={{
              flex: 1,
              minWidth: '250px',
              padding: '12px 16px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1rem',
            }}
          />
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
            }}
          >
            <option value="">All States</option>
            <option value="MA">Massachusetts</option>
            <option value="CA">California</option>
            <option value="TX">Texas</option>
            <option value="VA">Virginia</option>
            <option value="MD">Maryland</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching...' : 'Search & Analyze'}
          </button>
        </div>
      </form>

      {error && (
        <div className="premium-card" style={{ borderColor: 'var(--accent)', marginBottom: '24px' }}>
          <p style={{ color: 'var(--accent)', marginBottom: '12px' }}>Error: {error}</p>
          <p style={{ color: '#888', marginBottom: '12px' }}>
            The USASpending API may be temporarily unavailable. You can search manually:
          </p>
          <a
            href={`https://www.usaspending.gov/search/?hash=&recipient=${encodeURIComponent(searchTerm)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ textDecoration: 'none', display: 'inline-block' }}
          >
            Search on USASpending.gov
          </a>
        </div>
      )}

      {/* Risk Analysis Panel */}
      {riskAnalysis && (
        <div className="premium-card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Risk Analysis</h3>
            <div style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius)',
              background: getRiskColor(riskAnalysis.summary?.riskLevel),
              color: riskAnalysis.summary?.riskLevel === 'Low' ? '#000' : '#fff',
              fontWeight: 'bold',
            }}>
              {riskAnalysis.summary?.riskLevel || 'Unknown'} Risk
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <div style={{ color: '#888', fontSize: '0.85rem' }}>Total Awards</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{riskAnalysis.summary?.totalAwards || 0}</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: '0.85rem' }}>Total Awarded</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                {formatCurrency(riskAnalysis.summary?.totalAwarded || 0)}
              </div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: '0.85rem' }}>Risk Score</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: getRiskColor(riskAnalysis.summary?.riskLevel) }}>
                {riskAnalysis.summary?.riskScore || 0}/100
              </div>
            </div>
          </div>

          {riskAnalysis.riskFactors?.length > 0 && (
            <div>
              <h4 style={{ marginBottom: '8px' }}>Red Flags Detected</h4>
              {riskAnalysis.riskFactors.map((factor, i) => (
                <div key={i} style={{
                  padding: '12px',
                  marginBottom: '8px',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 'var(--radius)',
                  borderLeft: `3px solid ${factor.severity === 'high' ? 'var(--accent)' : factor.severity === 'medium' ? '#ff9900' : 'var(--primary)'}`,
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    {factor.type.replace(/_/g, ' ')}
                  </div>
                  <div style={{ color: '#888', fontSize: '0.9rem' }}>{factor.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Exclusion Status */}
      {exclusionStatus && (
        <div className="premium-card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginTop: 0 }}>SAM.gov Exclusion Check</h3>
          <p style={{ color: '#888' }}>
            Status: <span style={{ color: '#ff9900' }}>{exclusionStatus.status}</span>
          </p>
          <a
            href={exclusionStatus.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Verify on SAM.gov
          </a>
        </div>
      )}

      {/* Results Table */}
      {results && results.results?.length > 0 && (
        <div className="premium-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Federal Awards ({results.totalResults?.toLocaleString()} found)</h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Award ID</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Recipient</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', color: '#888' }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Agency</th>
                  <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((award, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {award['Award ID']?.substring(0, 15)}...
                    </td>
                    <td style={{ padding: '12px 8px' }}>{award['Recipient Name']}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold' }}>
                      {formatCurrency(award['Award Amount'])}
                    </td>
                    <td style={{ padding: '12px 8px', color: '#888', fontSize: '0.9rem' }}>
                      {award['Awarding Agency']?.substring(0, 25)}
                    </td>
                    <td style={{ padding: '12px 8px', color: '#888', fontSize: '0.85rem', maxWidth: '250px' }}>
                      {award['Description']?.substring(0, 60)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results && results.results?.length === 0 && (
        <div className="premium-card">
          <p style={{ color: '#888', textAlign: 'center' }}>No federal awards found for "{searchTerm}"</p>
        </div>
      )}

      {/* Info Panel */}
      {!results && !loading && (
        <div className="premium-card">
          <h3 style={{ marginTop: 0 }}>How to Use This Tool</h3>
          <ol style={{ color: '#888', lineHeight: 1.8 }}>
            <li>Enter a contractor name to search federal awards</li>
            <li>Review the risk analysis for potential red flags</li>
            <li>Check SAM.gov for exclusion/debarment status</li>
            <li>Investigate large awards, rapid growth, or concentrated funding</li>
          </ol>

          <h4>Common Red Flags</h4>
          <ul style={{ color: '#888', lineHeight: 1.8 }}>
            <li>Sudden spikes in contract values</li>
            <li>Awards concentrated from single agency</li>
            <li>Limited competition on large awards</li>
            <li>Parent company or affiliates debarred</li>
            <li>Pricing significantly off market rates</li>
          </ul>
        </div>
      )}
    </div>
  );
}

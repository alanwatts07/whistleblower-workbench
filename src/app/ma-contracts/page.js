'use client';

import { useState, useEffect } from 'react';

export default function MAContracts() {
  const [contracts, setContracts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [minAmount, setMinAmount] = useState(100000);
  const [selectedContract, setSelectedContract] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async (minAmt = 100000) => {
    setLoading(true);
    setError(null);

    try {
      // Use API route instead of server action for better network handling
      const response = await fetch('/api/ma-contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minAmount: minAmt, limit: 50 }),
      });

      const contractsResult = await response.json();

      if (contractsResult.success) {
        setContracts(contractsResult.results);
        // Calculate stats from results
        calculateStats(contractsResult.results);
        // Store model info
        setModelInfo({
          version: contractsResult.modelVersion,
          trained: contractsResult.modelTrained,
        });
      } else {
        setError(contractsResult.error || 'Failed to load contracts');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (contractsList) => {
    if (!contractsList || contractsList.length === 0) {
      setStats(null);
      return;
    }

    const totalValue = contractsList.reduce((sum, c) => sum + (parseFloat(c['Award Amount']) || 0), 0);

    // Group by recipient
    const byRecipient = {};
    contractsList.forEach(c => {
      const recipient = c['Recipient Name'] || 'Unknown';
      if (!byRecipient[recipient]) {
        byRecipient[recipient] = { count: 0, total: 0 };
      }
      byRecipient[recipient].count++;
      byRecipient[recipient].total += parseFloat(c['Award Amount']) || 0;
    });

    // Group by agency
    const byAgency = {};
    contractsList.forEach(c => {
      const agency = c['Awarding Agency'] || 'Unknown';
      if (!byAgency[agency]) {
        byAgency[agency] = { count: 0, total: 0 };
      }
      byAgency[agency].count++;
      byAgency[agency].total += parseFloat(c['Award Amount']) || 0;
    });

    // Risk distribution
    const riskDistribution = { High: 0, Medium: 0, Low: 0 };
    contractsList.forEach(c => {
      riskDistribution[c.riskAnalysis?.riskLevel || 'Low']++;
    });

    setStats({
      totalContracts: contractsList.length,
      totalValue,
      avgValue: totalValue / contractsList.length,
      topRecipients: Object.entries(byRecipient)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      topAgencies: Object.entries(byAgency)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      riskDistribution,
    });
  };

  const handleFilterChange = (e) => {
    e.preventDefault();
    loadContracts(minAmount);
  };

  const formatCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
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

  const getRiskBadge = (riskAnalysis) => {
    if (!riskAnalysis) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <span style={{
          padding: '4px 8px',
          borderRadius: '4px',
          background: getRiskColor(riskAnalysis.riskLevel),
          color: riskAnalysis.riskLevel === 'Low' ? '#000' : '#fff',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
        }}>
          {riskAnalysis.riskScore}/100
        </span>
        {riskAnalysis.confidence && (
          <span style={{ fontSize: '0.65rem', color: '#666' }}>
            {Math.round(riskAnalysis.confidence * 100)}% conf
          </span>
        )}
      </div>
    );
  };

  return (
    <div>
      <h1>Massachusetts Federal Contracts</h1>
      <p style={{ color: '#888', marginBottom: '24px' }}>
        Recent large federal contracts with Massachusetts place of performance, analyzed for fraud risk indicators
      </p>

      {/* Stats Overview */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div className="premium-card" style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Total Contracts</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.totalContracts}</div>
          </div>
          <div className="premium-card" style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Total Value</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              {formatCurrency(stats.totalValue)}
            </div>
          </div>
          <div className="premium-card" style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>High Risk</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)' }}>
              {stats.riskDistribution?.High || 0}
            </div>
          </div>
          <div className="premium-card" style={{ textAlign: 'center', padding: '16px' }}>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>Medium Risk</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#ff9900' }}>
              {stats.riskDistribution?.Medium || 0}
            </div>
          </div>
        </div>
      )}

      {/* Filter Form */}
      <form onSubmit={handleFilterChange} className="premium-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ color: '#888' }}>Minimum Award:</label>
          <select
            value={minAmount}
            onChange={(e) => setMinAmount(parseInt(e.target.value))}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
            }}
          >
            <option value={100000}>$100K+</option>
            <option value={500000}>$500K+</option>
            <option value={1000000}>$1M+</option>
            <option value={5000000}>$5M+</option>
            <option value={10000000}>$10M+</option>
            <option value={50000000}>$50M+</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Loading...' : 'Update'}
          </button>
          <span style={{ color: '#666', fontSize: '0.85rem', marginLeft: 'auto' }}>
            Data: Past 2 years from USASpending.gov
            {modelInfo?.trained && (
              <span style={{ marginLeft: '12px', color: 'var(--primary)' }}>
                ML Model v{modelInfo.version} (Trained)
              </span>
            )}
          </span>
        </div>
      </form>

      {error && (
        <div className="premium-card" style={{ borderColor: 'var(--accent)', marginBottom: '24px' }}>
          <p style={{ color: 'var(--accent)', margin: 0 }}>Error: {error}</p>
        </div>
      )}

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
        {/* Contracts Table */}
        <div className="premium-card" style={{ overflow: 'hidden' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
            Recent Large MA Contracts
            {!loading && <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.9rem' }}> ({contracts.length} shown)</span>}
          </h3>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
              Loading Massachusetts contracts...
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Risk</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Recipient</th>
                    <th style={{ textAlign: 'right', padding: '12px 8px', color: '#888' }}>Amount</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Agency</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((contract, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedContract(contract)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: selectedContract?.['Award ID'] === contract['Award ID'] ? 'rgba(0,255,157,0.1)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px 8px' }}>
                        {getRiskBadge(contract.riskAnalysis)}
                      </td>
                      <td style={{ padding: '12px 8px', maxWidth: '200px' }}>
                        <div style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {contract['Recipient Name']}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {contract['Place of Performance City'] || 'MA'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {formatCurrency(contract['Award Amount'])}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#888', fontSize: '0.85rem', maxWidth: '150px' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {contract['Awarding Agency']?.substring(0, 30)}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', color: '#666', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {contract['Start Date']?.substring(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar - Stats & Selected Contract */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Selected Contract Details */}
          {selectedContract && (
            <div className="premium-card">
              <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>Contract Details</h4>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Recipient</div>
                <div style={{ fontWeight: 'bold' }}>{selectedContract['Recipient Name']}</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Award Amount</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {formatCurrency(selectedContract['Award Amount'])}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Risk Score</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getRiskBadge(selectedContract.riskAnalysis)}
                  <span style={{ color: getRiskColor(selectedContract.riskAnalysis?.riskLevel) }}>
                    {selectedContract.riskAnalysis?.riskLevel} Risk
                  </span>
                </div>
                {selectedContract.riskAnalysis?.confidence && (
                  <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                    Confidence: {Math.round(selectedContract.riskAnalysis.confidence * 100)}%
                    {selectedContract.riskAnalysis?.modelVersion && (
                      <span style={{ marginLeft: '8px' }}>
                        (Model v{selectedContract.riskAnalysis.modelVersion})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {selectedContract.riskAnalysis?.factors?.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '8px' }}>Risk Factors</div>
                  {selectedContract.riskAnalysis.factors.map((factor, i) => (
                    <div key={i} style={{
                      padding: '8px',
                      marginBottom: '4px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '4px',
                      borderLeft: `2px solid ${getRiskColor(factor.severity === 'high' ? 'High' : factor.severity === 'medium' ? 'Medium' : 'Low')}`,
                      fontSize: '0.85rem',
                    }}>
                      {factor.description}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Agency</div>
                <div style={{ fontSize: '0.9rem' }}>{selectedContract['Awarding Agency']}</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Description</div>
                <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                  {selectedContract['Description']?.substring(0, 200) || 'No description'}...
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Award ID</div>
                <div style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{selectedContract['Award ID']}</div>
              </div>

              {/* ML Features */}
              {selectedContract.features && (
                <details style={{ marginBottom: '16px' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: '0.85rem' }}>
                    View ML Features
                  </summary>
                  <div style={{
                    marginTop: '8px',
                    padding: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                  }}>
                    {Object.entries(selectedContract.features)
                      .filter(([k, v]) => typeof v === 'number')
                      .map(([key, value]) => (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span style={{ color: '#888' }}>{key}:</span>
                          <span>{typeof value === 'number' && value > 1000 ? value.toLocaleString() : (typeof value === 'number' && value < 1 ? value.toFixed(2) : value)}</span>
                        </div>
                      ))
                    }
                  </div>
                </details>
              )}

              <a
                href={`https://www.usaspending.gov/award/${selectedContract['generated_internal_id']}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: 'none', display: 'block', textAlign: 'center', marginBottom: '8px' }}
              >
                View on USASpending.gov
              </a>

              <a
                href={`https://sam.gov/search/?keywords=${encodeURIComponent(selectedContract['Recipient Name'])}&index=ei`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{
                  textDecoration: 'none',
                  display: 'block',
                  textAlign: 'center',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                Check SAM.gov Exclusions
              </a>
            </div>
          )}

          {/* Top Recipients */}
          {stats && (
            <div className="premium-card">
              <h4 style={{ marginTop: 0 }}>Top MA Recipients</h4>
              <div style={{ fontSize: '0.85rem' }}>
                {stats.topRecipients?.slice(0, 7).map((recipient, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: i < 6 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {recipient.name}
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                      {formatCurrency(recipient.total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Agencies */}
          {stats && (
            <div className="premium-card">
              <h4 style={{ marginTop: 0 }}>Top Awarding Agencies</h4>
              <div style={{ fontSize: '0.85rem' }}>
                {stats.topAgencies?.slice(0, 5).map((agency, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: i < 4 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agency.name?.substring(0, 25)}
                    </div>
                    <div style={{ color: '#888' }}>
                      {agency.count} awards
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="premium-card" style={{ marginTop: '24px' }}>
        <h4 style={{ marginTop: 0 }}>
          ML-Powered Risk Score Methodology
          {modelInfo?.trained && (
            <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--primary)', marginLeft: '12px' }}>
              Trained on 82,709 OIG exclusion records + 18 FCA settlements
            </span>
          )}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', color: '#888', fontSize: '0.9rem' }}>
          <div>
            <strong style={{ color: 'var(--accent)' }}>High Risk (50+)</strong>
            <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
              <li>Statistical anomalies (z-score &gt; 2.5)</li>
              <li>Multiple fraud pattern matches</li>
              <li>High sole-source ratio</li>
              <li>Rapid YoY growth (&gt;200%)</li>
            </ul>
          </div>
          <div>
            <strong style={{ color: '#ff9900' }}>Medium Risk (25-49)</strong>
            <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
              <li>Large awards (&gt;$10M)</li>
              <li>Healthcare concentration</li>
              <li>High-risk categories (consulting, IT)</li>
              <li>Agency concentration &gt;80%</li>
            </ul>
          </div>
          <div>
            <strong style={{ color: 'var(--primary)' }}>Low Risk (0-24)</strong>
            <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
              <li>Standard contract patterns</li>
              <li>Diversified agency portfolio</li>
              <li>Competitive bidding</li>
              <li>Baseline defense contracts</li>
            </ul>
          </div>
        </div>
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,255,157,0.1)', borderRadius: '4px', fontSize: '0.85rem' }}>
          <strong>Data Sources:</strong> Model trained on HHS OIG LEIE exclusions, DOJ FCA settlements (GlaxoSmithKline, Pfizer, HCA, Northrop Grumman, etc.), and USASpending.gov contract patterns. Z-score anomaly detection identifies statistical outliers from baseline distributions.
        </div>
      </div>
    </div>
  );
}

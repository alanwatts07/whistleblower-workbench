'use client';

import { useState, useEffect } from 'react';
import { analyzePhysicianPayments } from '../../actions/openpayments';
import { getMAProviderVerificationLinks, getMAHighRiskPatterns, getRecentMASettlements } from '../../actions/masshealth';

export default function HealthcareFraud() {
  const [activeTab, setActiveTab] = useState('investigate');
  const [physicianName, setPhysicianName] = useState('');
  const [physicianState, setPhysicianState] = useState('MA');
  const [loading, setLoading] = useState(false);
  const [paymentAnalysis, setPaymentAnalysis] = useState(null);
  const [verificationLinks, setVerificationLinks] = useState(null);
  const [highRiskPatterns, setHighRiskPatterns] = useState(null);
  const [recentSettlements, setRecentSettlements] = useState(null);
  const [error, setError] = useState(null);

  // New state for provider investigation
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [providerSearchType, setProviderSearchType] = useState('providers');
  const [providerResults, setProviderResults] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [reviewResults, setReviewResults] = useState(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [exclusionStats, setExclusionStats] = useState(null);
  const [riskyProviders, setRiskyProviders] = useState(null);
  const [loadingRisky, setLoadingRisky] = useState(true);
  const [activeRiskyTab, setActiveRiskyTab] = useState('recent');

  useEffect(() => {
    loadExclusionStats();
    loadRiskyProviders();
  }, []);

  const loadExclusionStats = async () => {
    try {
      const res = await fetch('/api/healthcare-providers');
      const data = await res.json();
      if (data.success) {
        setExclusionStats(data);
      }
    } catch (err) {
      console.error('Error loading exclusion stats:', err);
    }
  };

  const loadRiskyProviders = async () => {
    setLoadingRisky(true);
    try {
      const res = await fetch('/api/healthcare-providers/risky');
      const data = await res.json();
      if (data.success) {
        setRiskyProviders(data);
      }
    } catch (err) {
      console.error('Error loading risky providers:', err);
    } finally {
      setLoadingRisky(false);
    }
  };

  const handleProviderSearch = async (e) => {
    e.preventDefault();
    if (!providerSearchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setProviderResults([]);
    setSelectedProvider(null);
    setReviewResults(null);

    try {
      const res = await fetch('/api/healthcare-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchType: providerSearchType,
          query: providerSearchQuery,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setProviderResults(data.results || []);
      } else {
        setError(data.error || 'Search failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const searchReviews = async (provider) => {
    setSelectedProvider(provider);
    setLoadingReviews(true);
    setReviewResults(null);

    try {
      const res = await fetch('/api/healthcare-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerName: provider.name,
          city: provider.city || 'Massachusetts',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setReviewResults(data);
      }
    } catch (err) {
      console.error('Review search error:', err);
      setReviewResults({ summary: { riskLevel: 'Unknown', note: 'Unable to search reviews' } });
    } finally {
      setLoadingReviews(false);
    }
  };

  const handlePhysicianSearch = async (e) => {
    e.preventDefault();
    if (!physicianName.trim()) return;

    setLoading(true);
    setError(null);
    setPaymentAnalysis(null);
    setVerificationLinks(null);

    try {
      const [analysisResult, linksResult] = await Promise.all([
        analyzePhysicianPayments(physicianName, physicianState || null),
        getMAProviderVerificationLinks(physicianName),
      ]);

      if (analysisResult.success) {
        setPaymentAnalysis(analysisResult);
      } else {
        setError(analysisResult.error || 'Failed to analyze payments');
      }

      if (linksResult.success) {
        setVerificationLinks(linksResult);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMAData = async () => {
    setLoading(true);
    try {
      const [patterns, settlements] = await Promise.all([
        getMAHighRiskPatterns(),
        getRecentMASettlements(),
      ]);

      if (patterns.success) setHighRiskPatterns(patterns);
      if (settlements.success) setRecentSettlements(settlements);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
      <h1>Healthcare Fraud Analysis</h1>
      <p style={{ color: '#888', marginBottom: '24px' }}>
        Analyze physician payments, MassHealth exclusions, and Medicaid fraud patterns
      </p>

      {/* Exclusion Stats Banner */}
      {exclusionStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <div className="premium-card" style={{ textAlign: 'center', padding: '12px', borderLeft: '3px solid var(--accent)' }}>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>MA Excluded Providers</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>
              {exclusionStats.totalExclusions?.toLocaleString()}
            </div>
          </div>
          <div className="premium-card" style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>Top Excluded Specialty</div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{exclusionStats.bySpecialty?.[0]?.specialty || 'N/A'}</div>
          </div>
          <div className="premium-card" style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>OIG Database</div>
            <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>82,709 records</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[
          { id: 'investigate', label: 'Provider Investigation' },
          { id: 'physician', label: 'Pharma Payments' },
          { id: 'massachusetts', label: 'MA Settlements' },
          { id: 'patterns', label: 'Fraud Patterns' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'massachusetts' && !highRiskPatterns) loadMAData();
            }}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: activeTab === tab.id ? 'var(--primary)' : 'var(--surface)',
              color: activeTab === tab.id ? '#000' : 'var(--foreground)',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="premium-card" style={{ borderColor: 'var(--accent)', marginBottom: '24px' }}>
          <p style={{ color: 'var(--accent)', margin: 0 }}>Error: {error}</p>
        </div>
      )}

      {/* Provider Investigation Tab */}
      {activeTab === 'investigate' && (
        <>
          {/* Search Form */}
          <form onSubmit={handleProviderSearch} className="premium-card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: '4px' }}>Search Type</label>
                <select
                  value={providerSearchType}
                  onChange={(e) => setProviderSearchType(e.target.value)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                  }}
                >
                  <option value="providers">Provider Lookup (NPI)</option>
                  <option value="medicare-payments">Medicare Payments</option>
                  <option value="exclusion-check">Exclusion Check</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: '4px' }}>Provider/Organization Name</label>
                <input
                  type="text"
                  value={providerSearchQuery}
                  onChange={(e) => setProviderSearchQuery(e.target.value)}
                  placeholder="Search or click a provider below..."
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'var(--background)',
                    color: 'var(--foreground)',
                  }}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading || !providerSearchQuery.trim()}>
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
            {/* Risky Providers List */}
            <div className="premium-card">
              {/* Sub-tabs for different risk categories */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[
                  { id: 'recent', label: 'Recent Exclusions', count: riskyProviders?.recentExclusions?.length },
                  { id: 'highrisk', label: 'High-Risk Specialties', count: riskyProviders?.highRiskProviders?.length },
                  { id: 'entities', label: 'Excluded Businesses', count: riskyProviders?.excludedEntities?.length },
                  { id: 'billers', label: 'Top Medicare Billers', count: riskyProviders?.highBillers?.length },
                  { id: 'search', label: 'Search Results', count: providerResults.length, show: providerResults.length > 0 },
                ].filter(t => t.show !== false).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveRiskyTab(tab.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: activeRiskyTab === tab.id ? 'var(--primary)' : 'transparent',
                      color: activeRiskyTab === tab.id ? '#000' : 'var(--foreground)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    {tab.label} {tab.count > 0 && <span style={{ opacity: 0.7 }}>({tab.count})</span>}
                  </button>
                ))}
              </div>

              {loadingRisky ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading risky providers...</div>
              ) : (
                <div style={{ maxHeight: '550px', overflowY: 'auto' }}>
                  {/* Recent Exclusions */}
                  {activeRiskyTab === 'recent' && riskyProviders?.recentExclusions?.map((provider, i) => (
                    <ProviderRow key={i} provider={provider} onSelect={searchReviews} selected={selectedProvider} formatCurrency={formatCurrency} getRiskColor={getRiskColor} />
                  ))}

                  {/* High-Risk Specialties */}
                  {activeRiskyTab === 'highrisk' && riskyProviders?.highRiskProviders?.map((provider, i) => (
                    <ProviderRow key={i} provider={provider} onSelect={searchReviews} selected={selectedProvider} formatCurrency={formatCurrency} getRiskColor={getRiskColor} />
                  ))}

                  {/* Excluded Entities */}
                  {activeRiskyTab === 'entities' && riskyProviders?.excludedEntities?.map((provider, i) => (
                    <ProviderRow key={i} provider={provider} onSelect={searchReviews} selected={selectedProvider} formatCurrency={formatCurrency} getRiskColor={getRiskColor} />
                  ))}

                  {/* Top Medicare Billers */}
                  {activeRiskyTab === 'billers' && riskyProviders?.highBillers?.map((provider, i) => (
                    <div
                      key={i}
                      onClick={() => searchReviews(provider)}
                      style={{
                        padding: '12px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: selectedProvider?.npi === provider.npi ? 'rgba(0,255,157,0.1)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{provider.name}</div>
                          <div style={{ fontSize: '0.85rem', color: '#888' }}>{provider.specialty} | {provider.city}</div>
                          <div style={{ fontSize: '0.75rem', color: '#666' }}>
                            {provider.beneficiaries?.toLocaleString()} patients | {provider.totalServices?.toLocaleString()} services
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                            {formatCurrency(provider.totalPayments)}
                          </div>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: getRiskColor(provider.riskLevel),
                            color: provider.riskLevel === 'Low' ? '#000' : '#fff',
                            fontSize: '0.7rem',
                          }}>{provider.riskLevel}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Search Results */}
                  {activeRiskyTab === 'search' && providerResults.map((provider, i) => (
                    <ProviderRow key={i} provider={provider} onSelect={searchReviews} selected={selectedProvider} formatCurrency={formatCurrency} getRiskColor={getRiskColor} showExcluded />
                  ))}

                  {activeRiskyTab === 'search' && providerResults.length === 0 && (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                      No search results. Use the search box above.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Provider Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedProvider && (
                <div className="premium-card">
                  <h4 style={{ marginTop: 0, color: 'var(--primary)' }}>Selected Provider</h4>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{selectedProvider.name}</div>
                    <div style={{ color: '#888', fontSize: '0.9rem' }}>{selectedProvider.specialty}</div>
                  </div>
                  {selectedProvider.totalPayments && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ color: '#888', fontSize: '0.85rem' }}>Medicare Payments</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                        {formatCurrency(selectedProvider.totalPayments)}
                      </div>
                    </div>
                  )}
                  {selectedProvider.isExcluded && (
                    <div style={{ padding: '10px', background: 'rgba(255,69,58,0.1)', borderRadius: '4px', marginBottom: '12px' }}>
                      <div style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '0.9rem' }}>WARNING: On OIG Exclusion List</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <a
                      href={`https://www.google.com/search?q="${encodeURIComponent(selectedProvider.name)}" Massachusetts reviews overcharged`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >Google Reviews</a>
                    <a
                      href={`https://www.yelp.com/search?find_desc=${encodeURIComponent(selectedProvider.name)}&find_loc=Massachusetts`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '6px 10px', background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >Yelp</a>
                  </div>
                </div>
              )}

              {/* Review Analysis */}
              {selectedProvider && (
                <div className="premium-card">
                  <h4 style={{ marginTop: 0 }}>
                    Billing Complaint Scan
                    {loadingReviews && <span style={{ fontWeight: 'normal', color: '#888' }}> (scanning...)</span>}
                  </h4>
                  {loadingReviews ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Searching for billing complaints...</div>
                  ) : reviewResults ? (
                    <div>
                      <div style={{
                        padding: '12px',
                        background: `rgba(${reviewResults.summary?.riskLevel === 'High' ? '255,69,58' : reviewResults.summary?.riskLevel === 'Medium' ? '255,153,0' : '0,255,157'},0.1)`,
                        borderRadius: '4px',
                        marginBottom: '12px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ color: getRiskColor(reviewResults.summary?.riskLevel), fontWeight: 'bold' }}>
                              {reviewResults.summary?.riskLevel || 'Unknown'} Risk
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#888' }}>
                              {reviewResults.summary?.billingMentions || 0} billing complaints
                            </div>
                          </div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: getRiskColor(reviewResults.summary?.riskLevel) }}>
                            {reviewResults.summary?.billingComplaintScore || 0}/100
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#888' }}>{reviewResults.summary?.recommendation}</div>
                      {(reviewResults.webMentions?.length > 0 || reviewResults.yelpMentions?.length > 0) && (
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '6px' }}>Found Mentions:</div>
                          {[...(reviewResults.webMentions || []), ...(reviewResults.yelpMentions || [])].slice(0, 3).map((m, i) => (
                            <div key={i} style={{ padding: '6px', marginBottom: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', fontSize: '0.75rem' }}>
                              {m.snippet?.substring(0, 150)}...
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
                      Click a provider to scan their online reviews for billing complaints
                    </div>
                  )}
                </div>
              )}

              {/* High-Risk Specialties */}
              {exclusionStats?.bySpecialty && (
                <div className="premium-card">
                  <h4 style={{ marginTop: 0 }}>Top Excluded Specialties (MA)</h4>
                  <div style={{ fontSize: '0.85rem' }}>
                    {exclusionStats.bySpecialty.slice(0, 6).map((spec, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          borderBottom: i < 5 ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer',
                        }}
                        onClick={() => { setProviderSearchQuery(spec.specialty); setProviderSearchType('exclusion-check'); }}
                      >
                        <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spec.specialty || 'Unknown'}</div>
                        <div style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{spec.count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Physician Lookup Tab */}
      {activeTab === 'physician' && (
        <>
          <form onSubmit={handlePhysicianSearch} className="premium-card" style={{ marginBottom: '24px' }}>
            <h3 style={{ marginTop: 0 }}>Open Payments Search</h3>
            <p style={{ color: '#888', marginBottom: '16px' }}>
              Search pharmaceutical/device company payments to physicians
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={physicianName}
                onChange={(e) => setPhysicianName(e.target.value)}
                placeholder="Enter physician name (e.g., John Smith)"
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
                value={physicianState}
                onChange={(e) => setPhysicianState(e.target.value)}
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
                <option value="NY">New York</option>
                <option value="CA">California</option>
                <option value="TX">Texas</option>
                <option value="FL">Florida</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Analyzing...' : 'Analyze Payments'}
              </button>
            </div>
          </form>

          {/* Payment Analysis Results */}
          {paymentAnalysis && (
            <>
              {/* Risk Summary */}
              <div className="premium-card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0 }}>Payment Analysis: {paymentAnalysis.physician?.searchName}</h3>
                  {paymentAnalysis.riskAnalysis && (
                    <div style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius)',
                      background: getRiskColor(paymentAnalysis.riskAnalysis.riskLevel),
                      color: paymentAnalysis.riskAnalysis.riskLevel === 'Low' ? '#000' : '#fff',
                      fontWeight: 'bold',
                    }}>
                      {paymentAnalysis.riskAnalysis.riskLevel} Risk
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ color: '#888', fontSize: '0.85rem' }}>Total Payments</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                      {formatCurrency(paymentAnalysis.summary?.totalPayments || 0)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: '0.85rem' }}>Payment Count</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                      {paymentAnalysis.summary?.paymentCount || 0}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#888', fontSize: '0.85rem' }}>Companies</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                      {paymentAnalysis.summary?.uniqueCompanies || 0}
                    </div>
                  </div>
                </div>

                {/* Risk Factors */}
                {paymentAnalysis.riskAnalysis?.factors?.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <h4 style={{ marginBottom: '8px' }}>Potential Concerns</h4>
                    {paymentAnalysis.riskAnalysis.factors.map((factor, i) => (
                      <div key={i} style={{
                        padding: '12px',
                        marginBottom: '8px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 'var(--radius)',
                        borderLeft: `3px solid ${getRiskColor(factor.severity === 'high' ? 'High' : factor.severity === 'medium' ? 'Medium' : 'Low')}`,
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

              {/* Top Paying Companies */}
              {paymentAnalysis.topPayingCompanies?.length > 0 && (
                <div className="premium-card" style={{ marginBottom: '24px' }}>
                  <h3 style={{ marginTop: 0 }}>Top Paying Companies</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Company</th>
                          <th style={{ textAlign: 'right', padding: '12px 8px', color: '#888' }}>Total</th>
                          <th style={{ textAlign: 'right', padding: '12px 8px', color: '#888' }}>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentAnalysis.topPayingCompanies.map((company, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 8px' }}>{company.company}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold' }}>
                              {formatCurrency(company.total)}
                            </td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: '#888' }}>
                              {company.count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Verification Links */}
          {verificationLinks && (
            <div className="premium-card">
              <h3 style={{ marginTop: 0 }}>Verification Resources</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                {Object.entries(verificationLinks.verificationLinks || {}).map(([key, link]) => (
                  <a
                    key={key}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      textDecoration: 'none',
                      color: 'var(--foreground)',
                      display: 'block',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--primary)' }}>
                      {link.name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#888' }}>{link.description}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Info Panel */}
          {!paymentAnalysis && !loading && (
            <div className="premium-card">
              <h3 style={{ marginTop: 0 }}>About Open Payments</h3>
              <p style={{ color: '#888' }}>
                The CMS Open Payments database tracks payments from pharmaceutical and medical device
                companies to physicians. High payment volumes or concentrated payments from single
                companies may indicate potential kickback arrangements worth investigating.
              </p>
              <h4>Red Flags to Watch</h4>
              <ul style={{ color: '#888', lineHeight: 1.8 }}>
                <li>Total payments exceeding $50,000</li>
                <li>Payments concentrated from single company (&gt;70%)</li>
                <li>Frequent consulting/speaking engagements</li>
                <li>Payments correlating with prescription patterns</li>
              </ul>
            </div>
          )}
        </>
      )}

      {/* Massachusetts Focus Tab */}
      {activeTab === 'massachusetts' && (
        <>
          {loading ? (
            <div className="premium-card">
              <p style={{ color: '#888', textAlign: 'center' }}>Loading Massachusetts data...</p>
            </div>
          ) : (
            <>
              {/* Recent Settlements */}
              {recentSettlements && (
                <div className="premium-card" style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0 }}>Recent Massachusetts FCA Settlements</h3>
                    <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                      Total Recovered: {formatCurrency(recentSettlements.totalRecovered)}
                    </div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Date</th>
                          <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Defendant</th>
                          <th style={{ textAlign: 'right', padding: '12px 8px', color: '#888' }}>Amount</th>
                          <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Type</th>
                          <th style={{ textAlign: 'left', padding: '12px 8px', color: '#888' }}>Allegation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentSettlements.settlements.map((settlement, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '12px 8px', color: '#888' }}>{settlement.date}</td>
                            <td style={{ padding: '12px 8px' }}>{settlement.defendant}</td>
                            <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--primary)', fontWeight: 'bold' }}>
                              {formatCurrency(settlement.amount)}
                            </td>
                            <td style={{ padding: '12px 8px', color: '#888' }}>{settlement.type}</td>
                            <td style={{ padding: '12px 8px', color: '#888', fontSize: '0.9rem' }}>
                              {settlement.allegation}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* High Risk Provider Types */}
              {highRiskPatterns && (
                <div className="premium-card">
                  <h3 style={{ marginTop: 0 }}>High-Risk Provider Categories in Massachusetts</h3>
                  <p style={{ color: '#888', marginBottom: '16px' }}>
                    Based on recent AG enforcement actions
                  </p>
                  <div style={{ display: 'grid', gap: '16px' }}>
                    {highRiskPatterns.highRiskProviderTypes.map((provider, i) => (
                      <div key={i} style={{
                        padding: '16px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 'var(--radius)',
                        borderLeft: `3px solid ${getRiskColor(provider.riskLevel)}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontWeight: 'bold' }}>{provider.type}</div>
                          <div style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: getRiskColor(provider.riskLevel),
                            color: provider.riskLevel === 'Low' ? '#000' : '#fff',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                          }}>
                            {provider.riskLevel} Risk
                          </div>
                        </div>
                        <div style={{ color: '#888', marginBottom: '8px', fontSize: '0.9rem' }}>
                          <strong>Common Schemes:</strong> {provider.commonSchemes.join(', ')}
                        </div>
                        <div style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>
                          Recent: {provider.recentSettlement}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Fraud Patterns Tab */}
      {activeTab === 'patterns' && (
        <div className="premium-card">
          <h3 style={{ marginTop: 0 }}>Common Healthcare Billing Fraud Patterns</h3>

          {[
            {
              name: 'Upcoding',
              description: 'Billing for more expensive procedures than actually performed',
              examples: ['Billing complex visit for simple checkup', 'Charging brand-name drug prices for generics', 'Level 5 E&M codes for Level 2 services'],
              detection: 'Compare procedure code distribution to specialty averages',
            },
            {
              name: 'Unbundling',
              description: 'Separating bundled services to increase reimbursement',
              examples: ['Billing incision/closure separately from surgery', 'Splitting lab panels into individual tests', 'Separate charges for inclusive follow-ups'],
              detection: 'Identify high rate of separate billing for typically-bundled services',
            },
            {
              name: 'Phantom Billing',
              description: 'Billing for services never rendered',
              examples: ['Claims for appointments that never occurred', 'Medical equipment never delivered', 'Tests never performed'],
              detection: 'Cross-reference claims with medical records and patient reports',
            },
            {
              name: 'Kickbacks',
              description: 'Payments to induce referrals for federal healthcare program services',
              examples: ['Pharma payments tied to prescribing', 'Lab fees for referral arrangements', 'Device company "consulting" fees'],
              detection: 'Correlate Open Payments data with prescribing/referral patterns',
            },
          ].map((pattern, i) => (
            <div key={i} style={{
              padding: '16px',
              marginBottom: '16px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 'var(--radius)',
              borderLeft: '3px solid var(--primary)',
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: 'var(--primary)' }}>{pattern.name}</h4>
              <p style={{ color: '#888', marginBottom: '12px' }}>{pattern.description}</p>
              <div style={{ marginBottom: '12px' }}>
                <strong style={{ fontSize: '0.9rem' }}>Examples:</strong>
                <ul style={{ color: '#888', margin: '4px 0 0 20px', fontSize: '0.9rem' }}>
                  {pattern.examples.map((ex, j) => <li key={j}>{ex}</li>)}
                </ul>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#888' }}>
                <strong>Detection:</strong> {pattern.detection}
              </div>
            </div>
          ))}

          <h3>Resources</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {[
              { name: 'CMS Open Payments', url: 'https://openpaymentsdata.cms.gov/' },
              { name: 'HHS OIG Exclusions', url: 'https://exclusions.oig.hhs.gov/' },
              { name: 'MassHealth Exclusions', url: 'https://www.mass.gov/info-details/learn-about-suspended-or-excluded-masshealth-providers' },
              { name: 'MA AG Healthcare Fraud', url: 'https://www.mass.gov/healthcare-fraud' },
            ].map((resource, i) => (
              <a
                key={i}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                {resource.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Provider Row Component
function ProviderRow({ provider, onSelect, selected, formatCurrency, getRiskColor, showExcluded }) {
  const isSelected = selected?.npi === provider.npi || selected?.name === provider.name;

  return (
    <div
      onClick={() => onSelect(provider)}
      style={{
        padding: '12px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: isSelected ? 'rgba(0,255,157,0.1)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            {provider.name}
            {(provider.isExcluded || provider.exclusionType) && (
              <span style={{
                marginLeft: '8px',
                padding: '2px 8px',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: '4px',
                fontSize: '0.7rem',
              }}>EXCLUDED</span>
            )}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#888' }}>
            {provider.specialty} {provider.city && `| ${provider.city}`}
          </div>
          {provider.reason && (
            <div style={{ fontSize: '0.75rem', color: '#ff9900', marginTop: '2px' }}>{provider.reason}</div>
          )}
          {provider.exclusionDate && (
            <div style={{ fontSize: '0.75rem', color: '#666' }}>Excluded: {provider.exclusionDate}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          {provider.totalPayments && (
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              {formatCurrency(provider.totalPayments)}
            </div>
          )}
          <span style={{
            padding: '2px 6px',
            borderRadius: '4px',
            background: getRiskColor(provider.riskLevel),
            color: provider.riskLevel === 'Low' ? '#000' : '#fff',
            fontSize: '0.7rem',
            fontWeight: 'bold',
          }}>{provider.riskLevel}</span>
        </div>
      </div>
    </div>
  );
}

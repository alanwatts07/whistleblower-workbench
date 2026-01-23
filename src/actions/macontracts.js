'use server';

/**
 * Server Actions for Massachusetts Contract Analysis
 * Fetches and analyzes recent large contracts in MA
 */

const USASPENDING_BASE = 'https://api.usaspending.gov/api/v2';

/**
 * Get recent large contracts with MA place of performance
 */
export async function getRecentMAContracts(options = {}) {
  const {
    minAmount = 100000, // $100K minimum
    limit = 50,
    page = 1,
  } = options;

  // Get contracts from past 2 years
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const requestBody = {
    filters: {
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ['A', 'B', 'C', 'D'], // Contracts only
      place_of_performance_locations: [{ country: 'USA', state: 'MA' }],
      award_amounts: [{ lower_bound: minAmount }],
    },
    fields: [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Total Outlays',
      'Description',
      'Start Date',
      'End Date',
      'Awarding Agency',
      'Awarding Sub Agency',
      'Contract Award Type',
      'recipient_id',
      'generated_internal_id',
      'Place of Performance City',
      'Place of Performance State Code',
      'NAICS Code',
      'NAICS Description',
    ],
    page,
    limit,
    sort: 'Award Amount',
    order: 'desc',
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${USASPENDING_BASE}/search/spending_by_award/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FalseClaimsSuite/1.0',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`USASpending API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const results = data.results || [];

    // Analyze each contract for risk factors
    const analyzedResults = results.map(contract => analyzeContractRisk(contract, results));

    return {
      success: true,
      results: analyzedResults,
      totalResults: data.page_metadata?.total || 0,
      page: data.page_metadata?.page || 1,
      dateRange: { startDate, endDate },
    };
  } catch (error) {
    console.error('MA contracts fetch error:', error);
    const errorMessage = error.name === 'AbortError'
      ? 'Request timed out - USASpending API may be slow'
      : error.message;
    return {
      success: false,
      error: errorMessage,
      results: [],
    };
  }
}

/**
 * Analyze a single contract for fraud risk indicators
 */
function analyzeContractRisk(contract, allContracts) {
  const riskFactors = [];
  let riskScore = 0;

  const amount = parseFloat(contract['Award Amount']) || 0;
  const recipientName = contract['Recipient Name'] || '';

  // 1. Very large contract (>$10M)
  if (amount > 10000000) {
    riskFactors.push({
      type: 'VERY_LARGE_AWARD',
      severity: 'medium',
      description: 'Award exceeds $10M - warrants additional scrutiny',
    });
    riskScore += 10;
  }

  // 2. Extremely large (>$100M)
  if (amount > 100000000) {
    riskFactors.push({
      type: 'EXTREMELY_LARGE_AWARD',
      severity: 'high',
      description: 'Award exceeds $100M - high value target for investigation',
    });
    riskScore += 20;
  }

  // 3. Check for multiple awards to same recipient (potential favoritism)
  const sameRecipientAwards = allContracts.filter(c =>
    c['Recipient Name'] === recipientName
  );
  if (sameRecipientAwards.length >= 3) {
    riskFactors.push({
      type: 'MULTIPLE_AWARDS',
      severity: 'low',
      description: `${sameRecipientAwards.length} awards to same recipient in dataset`,
    });
    riskScore += 5;
  }

  // 4. Check description for high-risk categories
  const description = (contract['Description'] || '').toLowerCase();
  const highRiskKeywords = [
    'sole source', 'emergency', 'urgent', 'no bid',
    'consulting', 'advisory', 'professional services',
    'it services', 'software', 'support services'
  ];

  const matchedKeywords = highRiskKeywords.filter(kw => description.includes(kw));
  if (matchedKeywords.length > 0) {
    riskFactors.push({
      type: 'HIGH_RISK_CATEGORY',
      severity: 'low',
      description: `Contract type often associated with fraud: ${matchedKeywords.join(', ')}`,
    });
    riskScore += 5 * matchedKeywords.length;
  }

  // 5. Defense-related (higher fraud rates historically)
  const agency = (contract['Awarding Agency'] || '').toLowerCase();
  if (agency.includes('defense') || agency.includes('army') || agency.includes('navy') || agency.includes('air force')) {
    riskFactors.push({
      type: 'DEFENSE_CONTRACT',
      severity: 'low',
      description: 'Defense contracts have historically higher fraud rates',
    });
    riskScore += 5;
  }

  // 6. Healthcare-related
  if (agency.includes('health') || description.includes('health') || description.includes('medical')) {
    riskFactors.push({
      type: 'HEALTHCARE_CONTRACT',
      severity: 'medium',
      description: 'Healthcare contracts subject to FCA enforcement',
    });
    riskScore += 10;
  }

  // Calculate risk level
  const riskLevel = riskScore >= 30 ? 'High' : riskScore >= 15 ? 'Medium' : 'Low';

  return {
    ...contract,
    riskAnalysis: {
      riskScore: Math.min(riskScore, 100),
      riskLevel,
      factors: riskFactors,
    },
  };
}

/**
 * Get contracts by specific agency in MA
 */
export async function getMAContractsByAgency(agencyName, options = {}) {
  const { limit = 25 } = options;

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const requestBody = {
    filters: {
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ['A', 'B', 'C', 'D'],
      place_of_performance_locations: [{ country: 'USA', state: 'MA' }],
      agencies: [{ type: 'awarding', tier: 'toptier', name: agencyName }],
    },
    fields: [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Description',
      'Start Date',
      'Awarding Agency',
    ],
    limit,
    sort: 'Award Amount',
    order: 'desc',
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${USASPENDING_BASE}/search/spending_by_award/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'FalseClaimsSuite/1.0',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      results: data.results || [],
      agency: agencyName,
    };
  } catch (error) {
    return { success: false, error: error.message, results: [] };
  }
}

/**
 * Get summary statistics for MA contracts
 */
export async function getMAContractStats() {
  const result = await getRecentMAContracts({ limit: 100 });

  if (!result.success) {
    return result;
  }

  const contracts = result.results;

  // Calculate stats
  const totalValue = contracts.reduce((sum, c) => sum + (parseFloat(c['Award Amount']) || 0), 0);
  const avgValue = totalValue / contracts.length;

  // Group by agency
  const byAgency = {};
  contracts.forEach(c => {
    const agency = c['Awarding Agency'] || 'Unknown';
    if (!byAgency[agency]) {
      byAgency[agency] = { count: 0, total: 0 };
    }
    byAgency[agency].count++;
    byAgency[agency].total += parseFloat(c['Award Amount']) || 0;
  });

  // Group by recipient
  const byRecipient = {};
  contracts.forEach(c => {
    const recipient = c['Recipient Name'] || 'Unknown';
    if (!byRecipient[recipient]) {
      byRecipient[recipient] = { count: 0, total: 0 };
    }
    byRecipient[recipient].count++;
    byRecipient[recipient].total += parseFloat(c['Award Amount']) || 0;
  });

  // Risk distribution
  const riskDistribution = { High: 0, Medium: 0, Low: 0 };
  contracts.forEach(c => {
    riskDistribution[c.riskAnalysis?.riskLevel || 'Low']++;
  });

  return {
    success: true,
    stats: {
      totalContracts: contracts.length,
      totalValue,
      avgValue,
      topAgencies: Object.entries(byAgency)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      topRecipients: Object.entries(byRecipient)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      riskDistribution,
    },
  };
}

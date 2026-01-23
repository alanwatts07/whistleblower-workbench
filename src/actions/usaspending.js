'use server';

/**
 * Server Actions for USASpending.gov API
 * Searches federal contract and grant awards
 */

const USASPENDING_BASE = 'https://api.usaspending.gov/api/v2';

/**
 * Search for awards by recipient name
 */
export async function searchContractorAwards(searchText, options = {}) {
  const {
    startDate = '2020-01-01',
    endDate = new Date().toISOString().split('T')[0],
    awardTypes = ['A', 'B', 'C', 'D'], // Contracts
    limit = 50,
    page = 1,
  } = options;

  const requestBody = {
    filters: {
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: awardTypes,
      recipient_search_text: [searchText],
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
    ],
    page,
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
      throw new Error(`USASpending API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      results: data.results || [],
      page: data.page_metadata?.page || 1,
      totalPages: Math.ceil((data.page_metadata?.total || 0) / limit),
      totalResults: data.page_metadata?.total || 0,
    };
  } catch (error) {
    console.error('USASpending search error:', error);
    return {
      success: false,
      error: error.name === 'AbortError' ? 'Request timed out' : error.message,
      results: [],
    };
  }
}

/**
 * Search for awards by state (place of performance)
 */
export async function searchAwardsByState(stateCode, options = {}) {
  const {
    startDate = '2020-01-01',
    endDate = new Date().toISOString().split('T')[0],
    awardTypes = ['A', 'B', 'C', 'D'],
    limit = 50,
    page = 1,
    recipientText = null,
  } = options;

  const filters = {
    time_period: [{ start_date: startDate, end_date: endDate }],
    award_type_codes: awardTypes,
    place_of_performance_locations: [{ country: 'USA', state: stateCode }],
  };

  if (recipientText) {
    filters.recipient_search_text = [recipientText];
  }

  const requestBody = {
    filters,
    fields: [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Description',
      'Start Date',
      'Awarding Agency',
      'Place of Performance City',
      'Place of Performance State Code',
    ],
    page,
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
      throw new Error(`USASpending API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      results: data.results || [],
      totalResults: data.page_metadata?.total || 0,
    };
  } catch (error) {
    return { success: false, error: error.name === 'AbortError' ? 'Request timed out' : error.message, results: [] };
  }
}

/**
 * Get recipient (contractor) profile
 */
export async function getRecipientProfile(recipientId) {
  try {
    const response = await fetch(`${USASPENDING_BASE}/recipient/${recipientId}/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Recipient API error: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Analyze contractor for red flags
 * Returns risk indicators based on award patterns
 */
export async function analyzeContractorRisk(searchText) {
  const result = await searchContractorAwards(searchText, {
    startDate: '2019-01-01',
    limit: 100,
  });

  if (!result.success || result.results.length === 0) {
    return {
      success: false,
      error: result.error || 'No awards found',
      riskFactors: [],
    };
  }

  const awards = result.results;
  const riskFactors = [];

  // Calculate metrics
  const totalAwarded = awards.reduce((sum, a) => sum + (parseFloat(a['Award Amount']) || 0), 0);
  const avgAward = totalAwarded / awards.length;

  // Check for large single awards (potential red flag)
  const largeAwards = awards.filter(a => parseFloat(a['Award Amount']) > avgAward * 3);
  if (largeAwards.length > 0) {
    riskFactors.push({
      type: 'LARGE_AWARD_CONCENTRATION',
      severity: 'medium',
      description: `${largeAwards.length} awards significantly above average`,
      details: largeAwards.map(a => ({
        id: a['Award ID'],
        amount: a['Award Amount'],
        agency: a['Awarding Agency'],
      })),
    });
  }

  // Check for award timing clusters (potential bid rigging indicator)
  const awardDates = awards
    .map(a => new Date(a['Start Date']))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);

  // Check for rapid growth
  const recentAwards = awards.filter(a => {
    const date = new Date(a['Start Date']);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return date > oneYearAgo;
  });

  const recentTotal = recentAwards.reduce((sum, a) => sum + (parseFloat(a['Award Amount']) || 0), 0);
  const historicalAvgPerYear = totalAwarded / 5; // Assuming 5-year window

  if (recentTotal > historicalAvgPerYear * 2) {
    riskFactors.push({
      type: 'RAPID_GROWTH',
      severity: 'medium',
      description: 'Award volume significantly increased in past year',
      details: {
        recentTotal,
        historicalAvgPerYear,
        growthMultiple: (recentTotal / historicalAvgPerYear).toFixed(2),
      },
    });
  }

  // Check agency concentration
  const agencyCounts = {};
  awards.forEach(a => {
    const agency = a['Awarding Agency'] || 'Unknown';
    agencyCounts[agency] = (agencyCounts[agency] || 0) + 1;
  });

  const topAgency = Object.entries(agencyCounts).sort((a, b) => b[1] - a[1])[0];
  if (topAgency && topAgency[1] / awards.length > 0.8) {
    riskFactors.push({
      type: 'AGENCY_CONCENTRATION',
      severity: 'low',
      description: `${Math.round(topAgency[1] / awards.length * 100)}% of awards from single agency`,
      details: { agency: topAgency[0], count: topAgency[1] },
    });
  }

  // Calculate overall risk score
  const riskScore = riskFactors.reduce((score, rf) => {
    if (rf.severity === 'high') return score + 30;
    if (rf.severity === 'medium') return score + 15;
    return score + 5;
  }, 0);

  return {
    success: true,
    summary: {
      totalAwards: awards.length,
      totalAwarded,
      avgAward,
      riskScore: Math.min(riskScore, 100),
      riskLevel: riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low',
    },
    riskFactors,
    awards: awards.slice(0, 10), // Return top 10 by amount
  };
}

'use server';

/**
 * Server Actions for CMS Open Payments Data
 * Analyzes pharmaceutical/device company payments to physicians
 */

const OPEN_PAYMENTS_BASE = 'https://openpaymentsdata.cms.gov/api/1/datastore/query';

/**
 * Search Open Payments by physician name
 * Uses the CMS Open Payments public API
 */
export async function searchPhysicianPayments(physicianName, options = {}) {
  const {
    state = null,
    limit = 100,
  } = options;

  // Parse name into first/last
  const nameParts = physicianName.trim().split(/\s+/);
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
  const firstName = nameParts.length > 1 ? nameParts[0] : '';

  // Build query for general payments dataset
  // Dataset ID for 2023 general payments
  const datasetId = '60847f33-b34a-5c31-9b28-44dc57e1d3d5';

  const queryParams = new URLSearchParams({
    'conditions[0][property]': 'covered_recipient_last_name',
    'conditions[0][value]': lastName.toUpperCase(),
    'conditions[0][operator]': '=',
    limit: limit.toString(),
  });

  if (firstName) {
    queryParams.append('conditions[1][property]', 'covered_recipient_first_name');
    queryParams.append('conditions[1][value]', firstName.toUpperCase());
    queryParams.append('conditions[1][operator]', 'STARTS_WITH');
  }

  if (state) {
    queryParams.append('conditions[2][property]', 'recipient_state');
    queryParams.append('conditions[2][value]', state.toUpperCase());
    queryParams.append('conditions[2][operator]', '=');
  }

  try {
    const response = await fetch(
      `${OPEN_PAYMENTS_BASE}/${datasetId}?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!response.ok) {
      // Fallback: provide manual search URL
      return {
        success: true,
        results: [],
        manualSearchUrl: `https://openpaymentsdata.cms.gov/search/physicians/by-name-and-location?firstname=${firstName}&lastname=${lastName}${state ? `&state=${state}` : ''}`,
        message: 'Use manual search URL for detailed results',
      };
    }

    const data = await response.json();
    const results = data.results || [];

    // Aggregate payments by company
    const paymentsByCompany = {};
    let totalPayments = 0;

    results.forEach(payment => {
      const company = payment.applicable_manufacturer_or_applicable_gpo_making_payment_name || 'Unknown';
      const amount = parseFloat(payment.total_amount_of_payment_usdollars) || 0;

      if (!paymentsByCompany[company]) {
        paymentsByCompany[company] = { count: 0, total: 0, payments: [] };
      }
      paymentsByCompany[company].count++;
      paymentsByCompany[company].total += amount;
      paymentsByCompany[company].payments.push({
        amount,
        nature: payment.nature_of_payment_or_transfer_of_value,
        date: payment.date_of_payment,
      });
      totalPayments += amount;
    });

    return {
      success: true,
      physician: {
        searchName: physicianName,
        state,
      },
      summary: {
        totalPayments,
        paymentCount: results.length,
        uniqueCompanies: Object.keys(paymentsByCompany).length,
      },
      paymentsByCompany: Object.entries(paymentsByCompany)
        .map(([company, data]) => ({ company, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20),
      results: results.slice(0, 50),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      manualSearchUrl: `https://openpaymentsdata.cms.gov/search/physicians/by-name-and-location?firstname=${firstName}&lastname=${lastName}`,
    };
  }
}

/**
 * Analyze physician for potential kickback red flags
 */
export async function analyzePhysicianPayments(physicianName, state = null) {
  const paymentData = await searchPhysicianPayments(physicianName, { state });

  if (!paymentData.success) {
    return paymentData;
  }

  const riskFactors = [];
  const { summary, paymentsByCompany } = paymentData;

  // Red flag: High total payments
  if (summary.totalPayments > 50000) {
    riskFactors.push({
      type: 'HIGH_PAYMENT_VOLUME',
      severity: summary.totalPayments > 100000 ? 'high' : 'medium',
      description: `Total payments: $${summary.totalPayments.toLocaleString()}`,
      details: 'High payment volumes may indicate consulting arrangements that could influence prescribing',
    });
  }

  // Red flag: Concentrated payments from single company
  if (paymentsByCompany.length > 0) {
    const topCompany = paymentsByCompany[0];
    const concentration = topCompany.total / summary.totalPayments;

    if (concentration > 0.7 && topCompany.total > 10000) {
      riskFactors.push({
        type: 'COMPANY_CONCENTRATION',
        severity: 'medium',
        description: `${Math.round(concentration * 100)}% of payments from ${topCompany.company}`,
        details: 'High concentration from single company may indicate problematic relationship',
      });
    }
  }

  // Red flag: Speaking/consulting fees (vs meals/travel)
  const highValuePaymentTypes = ['Consulting Fee', 'Compensation for services', 'Speaking'];
  const speakingPayments = paymentData.results?.filter(p =>
    highValuePaymentTypes.some(t =>
      (p.nature_of_payment_or_transfer_of_value || '').toLowerCase().includes(t.toLowerCase())
    )
  ) || [];

  if (speakingPayments.length > 10) {
    riskFactors.push({
      type: 'FREQUENT_CONSULTING',
      severity: 'medium',
      description: `${speakingPayments.length} consulting/speaking engagements`,
      details: 'Frequent paid engagements may create conflicts of interest',
    });
  }

  // Calculate risk score
  const riskScore = riskFactors.reduce((score, rf) => {
    if (rf.severity === 'high') return score + 30;
    if (rf.severity === 'medium') return score + 15;
    return score + 5;
  }, 0);

  return {
    success: true,
    physician: paymentData.physician,
    summary: paymentData.summary,
    riskAnalysis: {
      riskScore: Math.min(riskScore, 100),
      riskLevel: riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low',
      factors: riskFactors,
    },
    topPayingCompanies: paymentsByCompany.slice(0, 10),
    manualVerificationUrl: `https://openpaymentsdata.cms.gov/search/physicians/by-name-and-location`,
  };
}

/**
 * Search for Massachusetts physicians with high payment volumes
 */
export async function getHighPaymentMAPhysicians() {
  // This would require bulk data access
  // For now, provide the search interface
  return {
    success: true,
    message: 'Use the physician search to analyze individual providers',
    bulkDataUrl: 'https://www.cms.gov/priorities/key-initiatives/open-payments/data',
    note: 'Bulk data downloads available for comprehensive analysis',
  };
}

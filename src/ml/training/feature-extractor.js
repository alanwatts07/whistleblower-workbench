/**
 * Feature Extractor for Fraud Detection
 * Extracts features from contract/provider data for ML model training
 */

/**
 * Feature categories based on research on FCA fraud patterns
 */
const FEATURE_DEFINITIONS = {
  // Contract/Award Features
  contract: {
    awardAmount: { weight: 1.0, normalize: 'log' },
    awardGrowthRate: { weight: 1.5, normalize: 'minmax' },
    contractDuration: { weight: 0.5, normalize: 'minmax' },
    modificationCount: { weight: 1.2, normalize: 'log' },
    competitionLevel: { weight: 1.3, normalize: 'categorical' },
    agencyConcentration: { weight: 1.1, normalize: 'ratio' },
    subcontractorRatio: { weight: 0.8, normalize: 'ratio' },
  },

  // Provider/Billing Features (Healthcare)
  healthcare: {
    billingVsPeers: { weight: 2.0, normalize: 'zscore' },
    complexityCodeRatio: { weight: 1.8, normalize: 'ratio' },
    denialRate: { weight: 1.5, normalize: 'ratio' },
    patientVolume: { weight: 1.0, normalize: 'log' },
    referralConcentration: { weight: 1.5, normalize: 'ratio' },
    drugTestingRate: { weight: 1.3, normalize: 'ratio' },
    pharmaPayments: { weight: 1.7, normalize: 'log' },
    exclusionHistory: { weight: 2.5, normalize: 'binary' },
  },

  // Entity Features
  entity: {
    yearsInBusiness: { weight: 0.8, normalize: 'log' },
    ownershipChanges: { weight: 1.2, normalize: 'count' },
    relatedPartyExclusions: { weight: 2.0, normalize: 'binary' },
    priorSettlements: { weight: 2.5, normalize: 'count' },
    stateRiskLevel: { weight: 1.0, normalize: 'categorical' },
    industryRiskLevel: { weight: 1.2, normalize: 'categorical' },
  },
};

/**
 * Extract features from a government contractor
 */
function extractContractorFeatures(contractor, awards) {
  const features = {};

  // Basic stats
  const amounts = awards.map(a => parseFloat(a['Award Amount']) || 0);
  const totalAwarded = amounts.reduce((a, b) => a + b, 0);
  const avgAward = totalAwarded / amounts.length || 0;

  features.totalAwarded = totalAwarded;
  features.avgAward = avgAward;
  features.awardCount = awards.length;
  features.maxAward = Math.max(...amounts);
  features.minAward = Math.min(...amounts);
  features.awardStdDev = calculateStdDev(amounts);

  // Award concentration (Herfindahl index)
  const awardShares = amounts.map(a => a / totalAwarded);
  features.concentrationIndex = awardShares.reduce((sum, s) => sum + s * s, 0);

  // Agency concentration
  const agencyCounts = {};
  awards.forEach(a => {
    const agency = a['Awarding Agency'] || 'Unknown';
    agencyCounts[agency] = (agencyCounts[agency] || 0) + 1;
  });
  const maxAgencyShare = Math.max(...Object.values(agencyCounts)) / awards.length;
  features.agencyConcentration = maxAgencyShare;

  // Growth analysis
  const awardsByYear = groupByYear(awards, 'Start Date');
  features.yearOverYearGrowth = calculateGrowthRate(awardsByYear);

  // Competition indicators
  features.soleSourceRatio = awards.filter(a =>
    (a['Description'] || '').toLowerCase().includes('sole source')
  ).length / awards.length;

  // High-risk keywords
  const highRiskKeywords = [
    'consulting', 'advisory', 'professional services',
    'it services', 'software', 'support', 'emergency'
  ];
  features.highRiskCategoryRatio = awards.filter(a => {
    const desc = (a['Description'] || '').toLowerCase();
    return highRiskKeywords.some(kw => desc.includes(kw));
  }).length / awards.length;

  // Defense vs civilian
  features.defenseRatio = awards.filter(a => {
    const agency = (a['Awarding Agency'] || '').toLowerCase();
    return agency.includes('defense') || agency.includes('army') ||
           agency.includes('navy') || agency.includes('air force');
  }).length / awards.length;

  // Large award anomaly score
  const largeAwardThreshold = avgAward * 3;
  features.largeAwardRatio = amounts.filter(a => a > largeAwardThreshold).length / amounts.length;

  return features;
}

/**
 * Extract features from a healthcare provider
 */
function extractHealthcareFeatures(provider, billingData, openPayments) {
  const features = {};

  // Billing patterns
  if (billingData) {
    const totalBilled = billingData.reduce((sum, b) => sum + (b.amount || 0), 0);
    features.totalBilled = totalBilled;
    features.avgClaim = totalBilled / billingData.length;
    features.claimCount = billingData.length;

    // Code distribution (upcoding detection)
    const codeLevels = billingData.map(b => getCodeComplexity(b.code));
    const avgComplexity = codeLevels.reduce((a, b) => a + b, 0) / codeLevels.length;
    features.avgCodeComplexity = avgComplexity;
    features.highComplexityRatio = codeLevels.filter(c => c >= 4).length / codeLevels.length;

    // Service patterns
    features.uniqueServiceTypes = new Set(billingData.map(b => b.serviceType)).size;
    features.avgServicesPerPatient = billingData.length / (billingData.map(b => b.patientId).filter((v, i, a) => a.indexOf(v) === i).length || 1);
  }

  // Open Payments (pharma relationships)
  if (openPayments) {
    const totalPayments = openPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    features.totalPharmaPayments = totalPayments;
    features.pharmaPaymentCount = openPayments.length;
    features.uniquePharmaCompanies = new Set(openPayments.map(p => p.company)).size;

    // Payment concentration
    const paymentsByCompany = {};
    openPayments.forEach(p => {
      paymentsByCompany[p.company] = (paymentsByCompany[p.company] || 0) + p.amount;
    });
    const maxCompanyShare = Math.max(...Object.values(paymentsByCompany)) / totalPayments;
    features.pharmaConcentration = maxCompanyShare || 0;

    // High-value payment types
    features.consultingPaymentRatio = openPayments.filter(p =>
      (p.type || '').toLowerCase().includes('consulting') ||
      (p.type || '').toLowerCase().includes('speaking')
    ).length / openPayments.length;
  }

  // Exclusion history
  features.hasExclusionHistory = provider.excludedPreviously ? 1 : 0;
  features.relatedPartyExcluded = provider.relatedPartyExcluded ? 1 : 0;

  return features;
}

/**
 * Calculate composite fraud risk score from features
 */
function calculateFraudScore(features, featureType = 'contractor') {
  const weights = FEATURE_DEFINITIONS[featureType] || FEATURE_DEFINITIONS.contract;
  let score = 0;
  let totalWeight = 0;

  // Contractor scoring
  if (featureType === 'contractor') {
    // Award concentration risk
    if (features.concentrationIndex > 0.5) score += 15;
    if (features.agencyConcentration > 0.8) score += 10;

    // Growth anomaly
    if (features.yearOverYearGrowth > 2.0) score += 15;

    // Competition issues
    if (features.soleSourceRatio > 0.5) score += 20;

    // High-risk categories
    score += features.highRiskCategoryRatio * 15;

    // Large award concentration
    if (features.largeAwardRatio > 0.3) score += 15;

    // Defense premium (higher fraud rates historically)
    if (features.defenseRatio > 0.7) score += 5;
  }

  // Healthcare scoring
  if (featureType === 'healthcare') {
    // Billing anomalies
    if (features.highComplexityRatio > 0.4) score += 20;
    if (features.avgServicesPerPatient > 10) score += 15;

    // Pharma relationship concerns
    if (features.totalPharmaPayments > 50000) score += 15;
    if (features.totalPharmaPayments > 100000) score += 10;
    if (features.pharmaConcentration > 0.7) score += 10;
    if (features.consultingPaymentRatio > 0.3) score += 10;

    // Prior issues
    if (features.hasExclusionHistory) score += 30;
    if (features.relatedPartyExcluded) score += 20;
  }

  return Math.min(score, 100);
}

/**
 * Helper: Calculate standard deviation
 */
function calculateStdDev(values) {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / n);
}

/**
 * Helper: Group by year
 */
function groupByYear(items, dateField) {
  const byYear = {};
  items.forEach(item => {
    const date = item[dateField];
    if (date) {
      const year = date.substring(0, 4);
      byYear[year] = (byYear[year] || 0) + (parseFloat(item['Award Amount']) || 0);
    }
  });
  return byYear;
}

/**
 * Helper: Calculate year-over-year growth rate
 */
function calculateGrowthRate(byYear) {
  const years = Object.keys(byYear).sort();
  if (years.length < 2) return 0;

  const lastYear = byYear[years[years.length - 1]] || 0;
  const prevYear = byYear[years[years.length - 2]] || 1;

  return lastYear / prevYear;
}

/**
 * Helper: Get E&M code complexity level (1-5)
 */
function getCodeComplexity(code) {
  if (!code) return 1;
  const codeStr = code.toString();

  // E&M codes 99201-99205 (new patient), 99211-99215 (established)
  if (codeStr.match(/9920[1-5]/)) return parseInt(codeStr[4]);
  if (codeStr.match(/9921[1-5]/)) return parseInt(codeStr[4]);

  // Default medium complexity
  return 3;
}

/**
 * Normalize features for ML model
 */
function normalizeFeatures(features, method = 'minmax', stats = null) {
  const normalized = {};

  for (const [key, value] of Object.entries(features)) {
    if (typeof value !== 'number') {
      normalized[key] = value;
      continue;
    }

    switch (method) {
      case 'log':
        normalized[key] = Math.log1p(value);
        break;
      case 'zscore':
        if (stats && stats[key]) {
          normalized[key] = (value - stats[key].mean) / (stats[key].std || 1);
        } else {
          normalized[key] = value;
        }
        break;
      case 'minmax':
        if (stats && stats[key]) {
          const range = stats[key].max - stats[key].min || 1;
          normalized[key] = (value - stats[key].min) / range;
        } else {
          normalized[key] = value;
        }
        break;
      default:
        normalized[key] = value;
    }
  }

  return normalized;
}

module.exports = {
  FEATURE_DEFINITIONS,
  extractContractorFeatures,
  extractHealthcareFeatures,
  calculateFraudScore,
  normalizeFeatures,
};

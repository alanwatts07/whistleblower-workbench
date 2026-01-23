import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const USASPENDING_BASE = 'https://api.usaspending.gov/api/v2';
const MODEL_PATH = path.join(process.cwd(), 'src/ml/models/fraud-detector-trained.json');

// Load trained model
let trainedModel = null;
async function loadModel() {
  if (trainedModel) return trainedModel;
  try {
    const data = await fs.readFile(MODEL_PATH, 'utf-8');
    trainedModel = JSON.parse(data);
    console.log('Loaded trained fraud detection model for MA contracts');
    return trainedModel;
  } catch (error) {
    console.log('Trained model not found, using basic scoring');
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { minAmount = 100000, limit = 50, page = 1 } = body;

    // Load trained ML model
    const model = await loadModel();

    // Get contracts from past 3 years (more recent data)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 1095 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 3 years

    const requestBody = {
      filters: {
        time_period: [{ start_date: startDate, end_date: endDate }],
        award_type_codes: ['A', 'B', 'C', 'D'],
        place_of_performance_locations: [{ country: 'USA', state: 'MA' }],
        award_amounts: [{ lower_bound: minAmount }],
      },
      fields: [
        'Award ID',
        'Recipient Name',
        'Award Amount',
        'Description',
        'Start Date',
        'Awarding Agency',
        'generated_internal_id',
        'Place of Performance City',
      ],
      page,
      limit,
      sort: 'Award Amount',
      order: 'desc',
    };

    // Use curl as a workaround for Node.js fetch issues
    const curlCommand = `curl -s --max-time 30 "${USASPENDING_BASE}/search/spending_by_award/" -X POST -H "Content-Type: application/json" -d '${JSON.stringify(requestBody).replace(/'/g, "'\\''")}'`;

    const { stdout, stderr } = await execAsync(curlCommand);

    if (stderr) {
      console.error('Curl stderr:', stderr);
    }

    const data = JSON.parse(stdout);
    const results = data.results || [];

    // Group contracts by recipient to analyze patterns
    const byRecipient = {};
    results.forEach(c => {
      const name = c['Recipient Name'] || 'Unknown';
      if (!byRecipient[name]) byRecipient[name] = [];
      byRecipient[name].push(c);
    });

    // Analyze each contract with ML model
    const analyzedResults = results.map(contract =>
      analyzeContractWithML(contract, results, byRecipient, model)
    );

    return Response.json({
      success: true,
      results: analyzedResults,
      totalResults: data.page_metadata?.total || 0,
      page: data.page_metadata?.page || 1,
      dateRange: { startDate, endDate },
      modelVersion: model?.version || 'basic',
      modelTrained: model?.trained || false,
    });
  } catch (error) {
    console.error('MA contracts API error:', error);
    return Response.json({
      success: false,
      error: error.message,
      results: [],
    }, { status: 500 });
  }
}

/**
 * Extract features from contracts for ML model
 */
function extractFeatures(contracts) {
  if (!contracts || contracts.length === 0) {
    return {};
  }

  const amounts = contracts.map(c => parseFloat(c['Award Amount']) || 0);
  const totalAwarded = amounts.reduce((a, b) => a + b, 0);
  const avgAward = totalAwarded / amounts.length;

  // Agency concentration
  const agencyCounts = {};
  contracts.forEach(c => {
    const agency = c['Awarding Agency'] || 'Unknown';
    agencyCounts[agency] = (agencyCounts[agency] || 0) + 1;
  });
  const maxAgencyShare = Math.max(...Object.values(agencyCounts)) / contracts.length;

  // Growth analysis by year
  const byYear = {};
  contracts.forEach(c => {
    const date = c['Start Date'];
    if (date) {
      const year = date.substring(0, 4);
      byYear[year] = (byYear[year] || 0) + (parseFloat(c['Award Amount']) || 0);
    }
  });
  const years = Object.keys(byYear).sort();
  let growthRate = 1;
  if (years.length >= 2) {
    const lastYear = byYear[years[years.length - 1]] || 0;
    const prevYear = byYear[years[years.length - 2]] || 1;
    growthRate = lastYear / prevYear;
  }

  // High-risk keywords
  const highRiskKeywords = ['consulting', 'advisory', 'professional services', 'it services', 'software', 'support', 'sole source'];
  const highRiskCount = contracts.filter(c => {
    const desc = (c['Description'] || '').toLowerCase();
    return highRiskKeywords.some(kw => desc.includes(kw));
  }).length;

  // Defense ratio
  const defenseCount = contracts.filter(c => {
    const agency = (c['Awarding Agency'] || '').toLowerCase();
    return agency.includes('defense') || agency.includes('army') || agency.includes('navy') || agency.includes('air force');
  }).length;

  // Healthcare ratio
  const healthcareCount = contracts.filter(c => {
    const agency = (c['Awarding Agency'] || '').toLowerCase();
    const desc = (c['Description'] || '').toLowerCase();
    return agency.includes('health') || desc.includes('health') || desc.includes('medical');
  }).length;

  // Large award ratio
  const largeAwardThreshold = avgAward * 3;
  const largeAwardCount = amounts.filter(a => a > largeAwardThreshold).length;

  return {
    totalAwarded,
    avgAward,
    awardCount: contracts.length,
    agencyConcentration: maxAgencyShare,
    yearOverYearGrowth: growthRate,
    highRiskCategoryRatio: highRiskCount / contracts.length,
    defenseRatio: defenseCount / contracts.length,
    healthcareRatio: healthcareCount / contracts.length,
    largeAwardRatio: largeAwardCount / contracts.length,
    soleSourceRatio: contracts.filter(c =>
      (c['Description'] || '').toLowerCase().includes('sole source')
    ).length / contracts.length,
  };
}

/**
 * Score contractor using trained ML model
 */
function scoreWithModel(features, model) {
  let score = 0;
  const factors = [];
  const thresholds = model?.thresholds || {
    largeAwardMultiple: 3.0,
    growthRateAnomaly: 2.0,
    agencyConcentration: 0.8,
    soleSourceRatio: 0.5,
    lowRiskMax: 25,
    mediumRiskMax: 50,
    highRiskMin: 50,
  };

  // Large award concentration
  if (features.largeAwardRatio > 0.3) {
    const contribution = Math.round(features.largeAwardRatio * 30);
    score += contribution;
    factors.push({
      type: 'LARGE_AWARD_CONCENTRATION',
      description: `${Math.round(features.largeAwardRatio * 100)}% of awards significantly above average`,
      contribution,
      severity: contribution > 15 ? 'high' : 'medium',
    });
  }

  // Agency concentration
  if (features.agencyConcentration > thresholds.agencyConcentration) {
    score += 10;
    factors.push({
      type: 'AGENCY_CONCENTRATION',
      description: `${Math.round(features.agencyConcentration * 100)}% from single agency`,
      contribution: 10,
      severity: 'low',
    });
  }

  // Sole source ratio
  if (features.soleSourceRatio > thresholds.soleSourceRatio) {
    const contribution = Math.round(features.soleSourceRatio * 25);
    score += contribution;
    factors.push({
      type: 'HIGH_SOLE_SOURCE',
      description: `${Math.round(features.soleSourceRatio * 100)}% sole source contracts`,
      contribution,
      severity: 'medium',
    });
  }

  // Growth rate
  if (features.yearOverYearGrowth > thresholds.growthRateAnomaly) {
    const contribution = Math.min(Math.round((features.yearOverYearGrowth - 1) * 15), 25);
    score += contribution;
    factors.push({
      type: 'RAPID_GROWTH',
      description: `${Math.round(features.yearOverYearGrowth * 100)}% year-over-year growth`,
      contribution,
      severity: contribution > 15 ? 'high' : 'medium',
    });
  }

  // High-risk categories
  if (features.highRiskCategoryRatio > 0.3) {
    const contribution = Math.round(features.highRiskCategoryRatio * 20);
    score += contribution;
    factors.push({
      type: 'HIGH_RISK_CATEGORY',
      description: `${Math.round(features.highRiskCategoryRatio * 100)}% in high-risk categories (consulting, IT, etc.)`,
      contribution,
      severity: 'medium',
    });
  }

  // Defense contracts
  if (features.defenseRatio > 0.7) {
    score += 5;
    factors.push({
      type: 'DEFENSE_CONCENTRATION',
      description: 'Primarily defense contracts (historically higher fraud rates)',
      contribution: 5,
      severity: 'low',
    });
  }

  // Healthcare contracts
  if (features.healthcareRatio > 0.5) {
    score += 10;
    factors.push({
      type: 'HEALTHCARE_CONCENTRATION',
      description: 'Significant healthcare contracts (subject to FCA)',
      contribution: 10,
      severity: 'medium',
    });
  }

  // Apply z-score anomaly detection if model has feature stats
  if (model?.featureStats) {
    for (const [key, value] of Object.entries(features)) {
      if (typeof value !== 'number' || !model.featureStats[key]) continue;

      const stats = model.featureStats[key];
      const zScore = (value - stats.mean) / (stats.std || 1);

      if (Math.abs(zScore) > 2.5) {
        const contribution = Math.min(Math.round(Math.abs(zScore) * 5), 15);
        score += contribution;
        factors.push({
          type: 'STATISTICAL_ANOMALY',
          description: `${key}: ${value.toFixed(2)} is ${zScore.toFixed(1)} std devs from mean`,
          contribution,
          severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
        });
      }
    }
  }

  // Apply learned patterns
  if (model?.fraudPatterns?.commonFactors) {
    for (const factor of model.fraudPatterns.commonFactors.slice(0, 5)) {
      const featureKey = factor.indicator.toLowerCase().replace(/\s+/g, '_');
      if (features[featureKey] && features[featureKey] > 0.5) {
        const contribution = Math.round(factor.weight * 15);
        score += contribution;
        factors.push({
          type: 'PATTERN_MATCH',
          description: `Matches known fraud pattern: ${factor.indicator}`,
          contribution,
          severity: factor.weight > 0.3 ? 'high' : 'medium',
        });
      }
    }
  }

  score = Math.min(Math.round(score), 100);
  const riskLevel = score >= thresholds.highRiskMin ? 'High' :
                    score >= thresholds.lowRiskMax ? 'Medium' : 'Low';

  return {
    score,
    riskLevel,
    factors: factors.sort((a, b) => b.contribution - a.contribution),
    confidence: model?.trained ? 0.85 : 0.70,
  };
}

/**
 * Analyze contract with ML model
 */
function analyzeContractWithML(contract, allContracts, byRecipient, model) {
  const recipientName = contract['Recipient Name'] || 'Unknown';
  const recipientContracts = byRecipient[recipientName] || [contract];

  // Extract features for this recipient's contracts
  const features = extractFeatures(recipientContracts);

  // Score using ML model
  const mlScore = scoreWithModel(features, model);

  // Add contract-specific factors
  const amount = parseFloat(contract['Award Amount']) || 0;
  const description = (contract['Description'] || '').toLowerCase();
  const agency = (contract['Awarding Agency'] || '').toLowerCase();

  // Very large individual contract
  if (amount > 100000000) {
    mlScore.factors.push({
      type: 'EXTREMELY_LARGE_AWARD',
      severity: 'high',
      description: 'Award exceeds $100M - high value target for investigation',
      contribution: 20,
    });
    mlScore.score = Math.min(mlScore.score + 20, 100);
  } else if (amount > 10000000) {
    mlScore.factors.push({
      type: 'VERY_LARGE_AWARD',
      severity: 'medium',
      description: 'Award exceeds $10M - warrants additional scrutiny',
      contribution: 10,
    });
    mlScore.score = Math.min(mlScore.score + 10, 100);
  }

  // Update risk level based on final score
  mlScore.riskLevel = mlScore.score >= 50 ? 'High' :
                      mlScore.score >= 25 ? 'Medium' : 'Low';

  return {
    ...contract,
    riskAnalysis: {
      riskScore: mlScore.score,
      riskLevel: mlScore.riskLevel,
      factors: mlScore.factors,
      confidence: mlScore.confidence,
      modelVersion: model?.version || 'basic',
    },
    features, // Include extracted features for transparency
  };
}

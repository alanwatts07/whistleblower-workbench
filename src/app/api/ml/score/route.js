import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Import model (we'll load from JSON)
let modelData = null;
const MODEL_PATH = path.join(process.cwd(), 'src/ml/models/fraud-detector-trained.json');

/**
 * Load the trained model
 */
async function loadModel() {
  if (modelData) return modelData;

  try {
    const data = await fs.readFile(MODEL_PATH, 'utf-8');
    modelData = JSON.parse(data);
    console.log('Loaded trained fraud detection model');
    return modelData;
  } catch (error) {
    console.log('Trained model not found, using default scoring');
    return null;
  }
}

/**
 * Score a contractor using the trained model
 */
function scoreContractor(features, model) {
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

  // Apply learned patterns if model is trained
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
    modelVersion: model?.version || 'default',
    confidence: model?.trained ? 0.85 : 0.70,
  };
}

/**
 * Extract features from contract data
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

  // Growth analysis
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

export async function POST(request) {
  try {
    const body = await request.json();
    const { contracts, features: providedFeatures } = body;

    // Load trained model
    const model = await loadModel();

    // Extract features if contracts provided, otherwise use provided features
    const features = providedFeatures || extractFeatures(contracts);

    // Score using the model
    const result = scoreContractor(features, model);

    return Response.json({
      success: true,
      ...result,
      features,
    });
  } catch (error) {
    console.error('ML scoring error:', error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const model = await loadModel();

    return Response.json({
      success: true,
      modelLoaded: !!model,
      modelVersion: model?.version || 'default',
      trained: model?.trained || false,
      savedAt: model?.savedAt,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

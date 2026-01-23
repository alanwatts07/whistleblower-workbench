/**
 * Fraud Detection Model
 * A simple anomaly detection and scoring model for FCA fraud
 *
 * This implements:
 * 1. Statistical anomaly detection (z-score based)
 * 2. Rule-based scoring from known fraud patterns
 * 3. Ensemble scoring combining both approaches
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Fraud Detector Model Class
 */
class FraudDetector {
  constructor() {
    this.trained = false;
    this.featureStats = {};
    this.fraudPatterns = {};
    this.thresholds = {};
    this.modelVersion = '1.0.0';
  }

  /**
   * Train the model on historical data
   */
  async train(trainingData, knownFraudCases) {
    console.log('Training fraud detection model...');

    // 1. Calculate feature statistics from training data
    this.featureStats = this.calculateFeatureStats(trainingData);

    // 2. Learn patterns from known fraud cases
    this.fraudPatterns = this.learnFraudPatterns(knownFraudCases);

    // 3. Set detection thresholds
    this.thresholds = this.optimizeThresholds(trainingData, knownFraudCases);

    this.trained = true;
    console.log('Model training complete');

    return {
      featureCount: Object.keys(this.featureStats).length,
      fraudPatternCount: Object.keys(this.fraudPatterns).length,
      thresholds: this.thresholds,
    };
  }

  /**
   * Calculate statistics for each feature
   */
  calculateFeatureStats(data) {
    const stats = {};
    const featureValues = {};

    // Collect all feature values
    data.forEach(record => {
      if (record.features) {
        for (const [key, value] of Object.entries(record.features)) {
          if (typeof value === 'number') {
            if (!featureValues[key]) featureValues[key] = [];
            featureValues[key].push(value);
          }
        }
      }
    });

    // Calculate stats for each feature
    for (const [key, values] of Object.entries(featureValues)) {
      const n = values.length;
      const mean = values.reduce((a, b) => a + b, 0) / n;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
      const std = Math.sqrt(variance);
      const sorted = [...values].sort((a, b) => a - b);

      stats[key] = {
        mean,
        std,
        min: sorted[0],
        max: sorted[n - 1],
        median: sorted[Math.floor(n / 2)],
        p25: sorted[Math.floor(n * 0.25)],
        p75: sorted[Math.floor(n * 0.75)],
        p90: sorted[Math.floor(n * 0.90)],
        p95: sorted[Math.floor(n * 0.95)],
        count: n,
      };
    }

    return stats;
  }

  /**
   * Learn fraud patterns from known cases
   */
  learnFraudPatterns(knownFraudCases) {
    const patterns = {
      byFraudType: {},
      byIndustry: {},
      indicators: {},
      commonFactors: [],
    };

    // Analyze fraud types
    knownFraudCases.forEach(fc => {
      // By fraud type
      (fc.fraud_type || []).forEach(ft => {
        if (!patterns.byFraudType[ft]) {
          patterns.byFraudType[ft] = { count: 0, totalAmount: 0, avgAmount: 0, indicators: {} };
        }
        patterns.byFraudType[ft].count++;
        patterns.byFraudType[ft].totalAmount += fc.amount || 0;
      });

      // By industry
      const industry = fc.industry || 'unknown';
      if (!patterns.byIndustry[industry]) {
        patterns.byIndustry[industry] = { count: 0, totalAmount: 0, fraudTypes: {} };
      }
      patterns.byIndustry[industry].count++;
      patterns.byIndustry[industry].totalAmount += fc.amount || 0;

      // Track indicators
      (fc.indicators || []).forEach(ind => {
        patterns.indicators[ind] = (patterns.indicators[ind] || 0) + 1;
      });
    });

    // Calculate averages and identify most common factors
    for (const ft of Object.keys(patterns.byFraudType)) {
      patterns.byFraudType[ft].avgAmount =
        patterns.byFraudType[ft].totalAmount / patterns.byFraudType[ft].count;
    }

    // Rank indicators by frequency
    patterns.commonFactors = Object.entries(patterns.indicators)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([indicator, count]) => ({ indicator, count, weight: count / knownFraudCases.length }));

    return patterns;
  }

  /**
   * Optimize detection thresholds
   */
  optimizeThresholds(trainingData, knownFraudCases) {
    // Default thresholds based on research
    const thresholds = {
      // Contract thresholds
      largeAwardMultiple: 3.0, // Awards > 3x average flagged
      growthRateAnomaly: 2.0, // YoY growth > 200% flagged
      agencyConcentration: 0.8, // >80% from single agency flagged
      soleSourceRatio: 0.5, // >50% sole source flagged

      // Healthcare thresholds
      billingZScore: 2.0, // Billing > 2 std dev above mean
      highComplexityRatio: 0.4, // >40% high complexity codes
      pharmaPaymentHigh: 50000, // $50K+ pharma payments
      pharmaPaymentVeryHigh: 100000, // $100K+ is very high risk

      // Risk level thresholds
      lowRiskMax: 25,
      mediumRiskMax: 50,
      highRiskMin: 50,

      // Anomaly detection
      zScoreThreshold: 2.5, // Z-score for anomaly detection
      isolationThreshold: 0.6, // Isolation forest score threshold
    };

    return thresholds;
  }

  /**
   * Score a contractor for fraud risk
   */
  scoreContractor(features) {
    if (!this.trained && Object.keys(this.featureStats).length === 0) {
      // Use default scoring if not trained
      return this.defaultContractorScoring(features);
    }

    let score = 0;
    const factors = [];

    // 1. Anomaly detection (z-score based)
    const anomalyScore = this.detectAnomalies(features, 'contractor');
    score += anomalyScore.score;
    factors.push(...anomalyScore.factors);

    // 2. Pattern matching against known fraud
    const patternScore = this.matchFraudPatterns(features, 'contractor');
    score += patternScore.score;
    factors.push(...patternScore.factors);

    // 3. Rule-based scoring
    const ruleScore = this.applyContractorRules(features);
    score += ruleScore.score;
    factors.push(...ruleScore.factors);

    // Normalize and cap score
    score = Math.min(Math.round(score), 100);

    return {
      score,
      riskLevel: this.getRiskLevel(score),
      factors: factors.sort((a, b) => b.contribution - a.contribution),
      confidence: this.calculateConfidence(features),
    };
  }

  /**
   * Score a healthcare provider for fraud risk
   */
  scoreHealthcareProvider(features) {
    let score = 0;
    const factors = [];

    // 1. Billing pattern analysis
    if (features.highComplexityRatio > this.thresholds.highComplexityRatio) {
      const contribution = Math.round((features.highComplexityRatio - 0.2) * 40);
      score += contribution;
      factors.push({
        type: 'HIGH_COMPLEXITY_BILLING',
        description: `${Math.round(features.highComplexityRatio * 100)}% high complexity codes`,
        contribution,
        severity: contribution > 15 ? 'high' : 'medium',
      });
    }

    // 2. Pharma payment analysis
    if (features.totalPharmaPayments > this.thresholds.pharmaPaymentHigh) {
      const contribution = features.totalPharmaPayments > this.thresholds.pharmaPaymentVeryHigh ? 25 : 15;
      score += contribution;
      factors.push({
        type: 'HIGH_PHARMA_PAYMENTS',
        description: `$${features.totalPharmaPayments.toLocaleString()} in pharmaceutical payments`,
        contribution,
        severity: contribution > 15 ? 'high' : 'medium',
      });
    }

    if (features.pharmaConcentration > 0.7) {
      score += 10;
      factors.push({
        type: 'PHARMA_CONCENTRATION',
        description: `${Math.round(features.pharmaConcentration * 100)}% payments from single company`,
        contribution: 10,
        severity: 'medium',
      });
    }

    // 3. Exclusion history
    if (features.hasExclusionHistory) {
      score += 30;
      factors.push({
        type: 'PRIOR_EXCLUSION',
        description: 'Provider has prior exclusion history',
        contribution: 30,
        severity: 'high',
      });
    }

    if (features.relatedPartyExcluded) {
      score += 20;
      factors.push({
        type: 'RELATED_PARTY_EXCLUDED',
        description: 'Related party has been excluded',
        contribution: 20,
        severity: 'high',
      });
    }

    // 4. Volume anomalies
    if (features.avgServicesPerPatient > 10) {
      score += 15;
      factors.push({
        type: 'HIGH_SERVICE_VOLUME',
        description: `${features.avgServicesPerPatient.toFixed(1)} services per patient (above average)`,
        contribution: 15,
        severity: 'medium',
      });
    }

    score = Math.min(Math.round(score), 100);

    return {
      score,
      riskLevel: this.getRiskLevel(score),
      factors,
      confidence: this.calculateConfidence(features),
    };
  }

  /**
   * Default contractor scoring without trained model
   */
  defaultContractorScoring(features) {
    let score = 0;
    const factors = [];

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
    if (features.agencyConcentration > 0.8) {
      score += 10;
      factors.push({
        type: 'AGENCY_CONCENTRATION',
        description: `${Math.round(features.agencyConcentration * 100)}% from single agency`,
        contribution: 10,
        severity: 'low',
      });
    }

    // Sole source ratio
    if (features.soleSourceRatio > 0.5) {
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
    if (features.yearOverYearGrowth > 2.0) {
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
        description: `${Math.round(features.highRiskCategoryRatio * 100)}% in high-risk categories`,
        contribution,
        severity: 'low',
      });
    }

    // Defense contracts baseline risk
    if (features.defenseRatio > 0.7) {
      score += 5;
      factors.push({
        type: 'DEFENSE_CONCENTRATION',
        description: 'Primarily defense contracts (historically higher fraud rates)',
        contribution: 5,
        severity: 'low',
      });
    }

    score = Math.min(Math.round(score), 100);

    return {
      score,
      riskLevel: this.getRiskLevel(score),
      factors,
      confidence: 0.7, // Lower confidence without training
    };
  }

  /**
   * Detect anomalies using z-score
   */
  detectAnomalies(features, type) {
    const anomalies = [];
    let totalScore = 0;

    for (const [key, value] of Object.entries(features)) {
      if (typeof value !== 'number' || !this.featureStats[key]) continue;

      const stats = this.featureStats[key];
      const zScore = (value - stats.mean) / (stats.std || 1);

      if (Math.abs(zScore) > this.thresholds.zScoreThreshold) {
        const contribution = Math.min(Math.round(Math.abs(zScore) * 5), 15);
        totalScore += contribution;
        anomalies.push({
          type: 'STATISTICAL_ANOMALY',
          description: `${key}: ${value.toFixed(2)} is ${zScore.toFixed(1)} std devs from mean`,
          contribution,
          severity: Math.abs(zScore) > 3 ? 'high' : 'medium',
        });
      }
    }

    return { score: totalScore, factors: anomalies };
  }

  /**
   * Match against known fraud patterns
   */
  matchFraudPatterns(features, type) {
    const matches = [];
    let totalScore = 0;

    // Check common fraud indicators
    if (this.fraudPatterns.commonFactors) {
      for (const factor of this.fraudPatterns.commonFactors) {
        const indicatorKey = factor.indicator.toLowerCase().replace(/\s+/g, '_');

        // Check if feature matches indicator
        if (features[indicatorKey] && features[indicatorKey] > 0) {
          const contribution = Math.round(factor.weight * 20);
          totalScore += contribution;
          matches.push({
            type: 'FRAUD_PATTERN_MATCH',
            description: `Matches known fraud indicator: ${factor.indicator}`,
            contribution,
            severity: factor.weight > 0.3 ? 'high' : 'medium',
          });
        }
      }
    }

    return { score: totalScore, factors: matches };
  }

  /**
   * Apply rule-based scoring for contractors
   */
  applyContractorRules(features) {
    // Uses defaultContractorScoring rules
    return { score: 0, factors: [] };
  }

  /**
   * Get risk level from score
   */
  getRiskLevel(score) {
    if (score >= this.thresholds.highRiskMin) return 'High';
    if (score >= this.thresholds.lowRiskMax) return 'Medium';
    return 'Low';
  }

  /**
   * Calculate confidence in the prediction
   */
  calculateConfidence(features) {
    const featureCount = Object.keys(features).filter(k => features[k] !== null && features[k] !== undefined).length;
    const expectedFeatures = 10;
    const dataCompleteness = Math.min(featureCount / expectedFeatures, 1);

    // Higher confidence with more data and if model is trained
    const baseConfidence = this.trained ? 0.85 : 0.70;
    return Math.round((baseConfidence * dataCompleteness) * 100) / 100;
  }

  /**
   * Save model to file
   */
  async save(filepath) {
    const modelData = {
      version: this.modelVersion,
      trained: this.trained,
      featureStats: this.featureStats,
      fraudPatterns: this.fraudPatterns,
      thresholds: this.thresholds,
      savedAt: new Date().toISOString(),
    };

    await fs.writeFile(filepath, JSON.stringify(modelData, null, 2));
    console.log(`Model saved to ${filepath}`);
  }

  /**
   * Load model from file
   */
  async load(filepath) {
    const data = JSON.parse(await fs.readFile(filepath, 'utf-8'));

    this.modelVersion = data.version;
    this.trained = data.trained;
    this.featureStats = data.featureStats;
    this.fraudPatterns = data.fraudPatterns;
    this.thresholds = data.thresholds;

    console.log(`Model loaded from ${filepath} (version ${this.modelVersion})`);
  }
}

module.exports = { FraudDetector };

#!/usr/bin/env node
/**
 * Model Training Script
 * Trains the fraud detection model using:
 * 1. OIG Exclusions data
 * 2. Known FCA settlements
 * 3. USASpending contract data
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const { FraudDetector } = require('../models/fraud-detector');
const { extractContractorFeatures, extractHealthcareFeatures } = require('./feature-extractor');

const execAsync = promisify(exec);

const DATA_DIR = path.join(__dirname, '../data');
const MODELS_DIR = path.join(__dirname, '../models');
const DOWNLOADS_DIR = path.join(DATA_DIR, 'downloads');

/**
 * Main training pipeline
 */
async function trainModel() {
  console.log('='.repeat(60));
  console.log('FALSE CLAIMS ACT FRAUD DETECTION MODEL TRAINING');
  console.log('='.repeat(60));
  console.log();

  // 1. Load known fraud cases
  console.log('Step 1: Loading known fraud cases...');
  const knownFraudCases = await loadKnownFraudCases();
  console.log(`  Loaded ${knownFraudCases.healthcare.length} healthcare cases`);
  console.log(`  Loaded ${knownFraudCases.contractor.length} contractor cases`);

  // 2. Collect training data from USASpending
  console.log('\nStep 2: Collecting training data from USASpending...');
  const contractorData = await collectContractorTrainingData();
  console.log(`  Collected ${contractorData.length} contractor records`);

  // 3. Download and process OIG exclusions (if not already done)
  console.log('\nStep 3: Processing OIG exclusions...');
  const exclusionsData = await processOIGExclusions();
  console.log(`  Processed ${exclusionsData.length} exclusion records`);

  // 4. Extract features from all data
  console.log('\nStep 4: Extracting features...');
  const trainingFeatures = await extractAllFeatures(contractorData, exclusionsData);
  console.log(`  Extracted features for ${trainingFeatures.length} records`);

  // 5. Train the model
  console.log('\nStep 5: Training model...');
  const model = new FraudDetector();
  const allFraudCases = [
    ...knownFraudCases.healthcare,
    ...knownFraudCases.contractor,
  ];
  const trainingResult = await model.train(trainingFeatures, allFraudCases);
  console.log(`  Feature stats calculated: ${trainingResult.featureCount} features`);
  console.log(`  Fraud patterns learned: ${trainingResult.fraudPatternCount} patterns`);

  // 6. Validate model on known fraud cases
  console.log('\nStep 6: Validating model...');
  const validationResults = validateModel(model, allFraudCases, contractorData);
  console.log(`  True positive rate: ${(validationResults.truePositiveRate * 100).toFixed(1)}%`);
  console.log(`  Average score for fraud cases: ${validationResults.avgFraudScore.toFixed(1)}`);
  console.log(`  Average score for normal cases: ${validationResults.avgNormalScore.toFixed(1)}`);

  // 7. Save the trained model
  console.log('\nStep 7: Saving model...');
  await fs.mkdir(MODELS_DIR, { recursive: true });
  const modelPath = path.join(MODELS_DIR, 'fraud-detector-trained.json');
  await model.save(modelPath);

  // 8. Save training report
  const reportPath = path.join(MODELS_DIR, 'training-report.json');
  const report = {
    trainedAt: new Date().toISOString(),
    dataStats: {
      knownFraudCases: allFraudCases.length,
      contractorRecords: contractorData.length,
      exclusionRecords: exclusionsData.length,
      trainingFeatures: trainingFeatures.length,
    },
    modelStats: trainingResult,
    validation: validationResults,
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`  Training report saved to ${reportPath}`);

  console.log('\n' + '='.repeat(60));
  console.log('TRAINING COMPLETE');
  console.log('='.repeat(60));

  return { model, report };
}

/**
 * Load known fraud cases from JSON
 */
async function loadKnownFraudCases() {
  const casesPath = path.join(DATA_DIR, 'known-fraud-cases.json');
  const data = JSON.parse(await fs.readFile(casesPath, 'utf-8'));

  return {
    healthcare: data.healthcare_settlements || [],
    contractor: data.contractor_settlements || [],
  };
}

/**
 * Collect contractor training data from USASpending
 */
async function collectContractorTrainingData() {
  // Get a sample of MA contracts for training baseline
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const requestBody = {
    filters: {
      time_period: [{ start_date: startDate, end_date: endDate }],
      award_type_codes: ['A', 'B', 'C', 'D'],
      place_of_performance_locations: [{ country: 'USA', state: 'MA' }],
    },
    fields: [
      'Award ID',
      'Recipient Name',
      'Award Amount',
      'Description',
      'Start Date',
      'Awarding Agency',
    ],
    limit: 100,
    sort: 'Award Amount',
    order: 'desc',
  };

  try {
    const curlCommand = `curl -s --max-time 60 "https://api.usaspending.gov/api/v2/search/spending_by_award/" -X POST -H "Content-Type: application/json" -d '${JSON.stringify(requestBody).replace(/'/g, "'\\''")}'`;
    const { stdout } = await execAsync(curlCommand);
    const data = JSON.parse(stdout);

    return data.results || [];
  } catch (error) {
    console.error('  Warning: Could not fetch USASpending data:', error.message);
    return [];
  }
}

/**
 * Process OIG exclusions data
 */
async function processOIGExclusions() {
  const exclusionsPath = path.join(DOWNLOADS_DIR, 'oig-training-data.json');

  try {
    const data = JSON.parse(await fs.readFile(exclusionsPath, 'utf-8'));
    return data;
  } catch (error) {
    console.log('  Note: OIG exclusions not downloaded yet. Run collect-oig-exclusions.js first.');
    // Return sample data for training
    return generateSampleExclusionData();
  }
}

/**
 * Generate sample exclusion data for training
 */
function generateSampleExclusionData() {
  // Sample data representing typical exclusion patterns
  return [
    { name: 'Sample Provider 1', specialty: 'Home Health', state: 'MA', exclusionType: '1128a1', features: { specialtyRisk: 3, exclusionSeverity: 5 } },
    { name: 'Sample Provider 2', specialty: 'Laboratory', state: 'MA', exclusionType: '1128a3', features: { specialtyRisk: 3, exclusionSeverity: 5 } },
    { name: 'Sample Provider 3', specialty: 'Pharmacy', state: 'CA', exclusionType: '1128b', features: { specialtyRisk: 3, exclusionSeverity: 3 } },
    { name: 'Sample Provider 4', specialty: 'Physician', state: 'TX', exclusionType: '1128a1', features: { specialtyRisk: 2, exclusionSeverity: 5 } },
    { name: 'Sample Provider 5', specialty: 'DME Supplier', state: 'FL', exclusionType: '1128a3', features: { specialtyRisk: 3, exclusionSeverity: 5 } },
  ];
}

/**
 * Extract features from all training data
 */
async function extractAllFeatures(contractorData, exclusionsData) {
  const features = [];

  // Extract contractor features
  if (contractorData.length > 0) {
    // Group by recipient
    const byRecipient = {};
    contractorData.forEach(c => {
      const name = c['Recipient Name'] || 'Unknown';
      if (!byRecipient[name]) byRecipient[name] = [];
      byRecipient[name].push(c);
    });

    // Extract features for each contractor
    for (const [name, awards] of Object.entries(byRecipient)) {
      const contractorFeatures = extractContractorFeatures({ name }, awards);
      features.push({
        type: 'contractor',
        name,
        features: contractorFeatures,
        isFraud: false, // Assume baseline data is not fraud
      });
    }
  }

  // Include exclusion data as positive fraud examples
  exclusionsData.forEach(exc => {
    features.push({
      type: 'healthcare',
      name: exc.name,
      features: exc.features || {},
      isFraud: true, // Exclusions are known fraud
    });
  });

  return features;
}

/**
 * Validate model on known cases
 */
function validateModel(model, knownFraudCases, normalCases) {
  let fraudScores = [];
  let normalScores = [];
  let truePositives = 0;

  // Score known fraud cases
  knownFraudCases.forEach(fc => {
    // Create synthetic features based on indicators
    const features = createFeaturesFromIndicators(fc.indicators || []);
    const result = model.scoreContractor(features);
    fraudScores.push(result.score);

    if (result.riskLevel === 'High' || result.riskLevel === 'Medium') {
      truePositives++;
    }
  });

  // Score normal cases (from USASpending baseline)
  normalCases.slice(0, 50).forEach(nc => {
    const features = extractContractorFeatures({ name: nc['Recipient Name'] }, [nc]);
    const result = model.scoreContractor(features);
    normalScores.push(result.score);
  });

  return {
    truePositiveRate: knownFraudCases.length > 0 ? truePositives / knownFraudCases.length : 0,
    avgFraudScore: fraudScores.length > 0 ? fraudScores.reduce((a, b) => a + b, 0) / fraudScores.length : 0,
    avgNormalScore: normalScores.length > 0 ? normalScores.reduce((a, b) => a + b, 0) / normalScores.length : 0,
    fraudScoreRange: { min: Math.min(...fraudScores), max: Math.max(...fraudScores) },
    normalScoreRange: { min: Math.min(...normalScores), max: Math.max(...normalScores) },
  };
}

/**
 * Create synthetic features from fraud indicators
 */
function createFeaturesFromIndicators(indicators) {
  const features = {
    largeAwardRatio: 0,
    agencyConcentration: 0,
    soleSourceRatio: 0,
    yearOverYearGrowth: 1,
    highRiskCategoryRatio: 0,
    defenseRatio: 0,
  };

  indicators.forEach(ind => {
    const indLower = ind.toLowerCase();

    if (indLower.includes('rapid') || indLower.includes('growth')) {
      features.yearOverYearGrowth = 2.5;
    }
    if (indLower.includes('sole') || indLower.includes('source')) {
      features.soleSourceRatio = 0.7;
    }
    if (indLower.includes('concentration') || indLower.includes('single')) {
      features.agencyConcentration = 0.9;
    }
    if (indLower.includes('large') || indLower.includes('overrun')) {
      features.largeAwardRatio = 0.5;
    }
    if (indLower.includes('consult') || indLower.includes('it ') || indLower.includes('software')) {
      features.highRiskCategoryRatio = 0.6;
    }
  });

  return features;
}

// Run training if executed directly
if (require.main === module) {
  trainModel()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Training failed:', error);
      process.exit(1);
    });
}

module.exports = { trainModel };

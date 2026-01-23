/**
 * OIG Exclusions Data Collector
 * Downloads and parses the HHS OIG LEIE (List of Excluded Individuals/Entities)
 *
 * Data Source: https://oig.hhs.gov/exclusions/exclusions_list.asp
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

// OIG LEIE Download URL (CSV format)
const OIG_LEIE_URL = 'https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv';
const DATA_DIR = path.join(__dirname, 'downloads');

/**
 * Download the OIG LEIE database
 */
async function downloadOIGExclusions() {
  console.log('Downloading OIG LEIE database...');

  await fs.mkdir(DATA_DIR, { recursive: true });
  const outputPath = path.join(DATA_DIR, 'oig-leie.csv');

  try {
    const { stdout, stderr } = await execAsync(
      `curl -s -o "${outputPath}" "${OIG_LEIE_URL}"`,
      { timeout: 120000 }
    );

    const stats = await fs.stat(outputPath);
    console.log(`Downloaded OIG LEIE: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    return outputPath;
  } catch (error) {
    console.error('Failed to download OIG LEIE:', error.message);
    throw error;
  }
}

/**
 * Parse the OIG LEIE CSV file
 */
async function parseOIGExclusions(csvPath) {
  console.log('Parsing OIG LEIE data...');

  const content = await fs.readFile(csvPath, 'utf-8');
  const lines = content.split('\n');

  // Skip header row
  const header = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const exclusions = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    // Parse CSV line (handling quoted fields)
    const values = parseCSVLine(lines[i]);

    if (values.length >= 10) {
      exclusions.push({
        lastName: values[0],
        firstName: values[1],
        middleName: values[2],
        busName: values[3], // Business name
        general: values[4],
        specialty: values[5],
        upin: values[6],
        npi: values[7],
        dob: values[8],
        address: values[9],
        city: values[10],
        state: values[11],
        zip: values[12],
        exclType: values[13],
        exclDate: values[14],
        reinstDate: values[15],
        waiverDate: values[16],
        waiverState: values[17],
      });
    }
  }

  console.log(`Parsed ${exclusions.length} exclusion records`);
  return exclusions;
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

/**
 * Extract fraud patterns from exclusion data
 */
function analyzeExclusionPatterns(exclusions) {
  const patterns = {
    byState: {},
    byExclusionType: {},
    bySpecialty: {},
    byYear: {},
    entityVsIndividual: { entity: 0, individual: 0 },
  };

  exclusions.forEach(exc => {
    // By state
    const state = exc.state || 'Unknown';
    patterns.byState[state] = (patterns.byState[state] || 0) + 1;

    // By exclusion type
    const exclType = exc.exclType || 'Unknown';
    patterns.byExclusionType[exclType] = (patterns.byExclusionType[exclType] || 0) + 1;

    // By specialty
    const specialty = exc.specialty || 'Unknown';
    patterns.bySpecialty[specialty] = (patterns.bySpecialty[specialty] || 0) + 1;

    // By year
    if (exc.exclDate) {
      const year = exc.exclDate.substring(0, 4);
      patterns.byYear[year] = (patterns.byYear[year] || 0) + 1;
    }

    // Entity vs Individual
    if (exc.busName && exc.busName.trim()) {
      patterns.entityVsIndividual.entity++;
    } else {
      patterns.entityVsIndividual.individual++;
    }
  });

  return patterns;
}

/**
 * Get Massachusetts-specific exclusions
 */
function getMAExclusions(exclusions) {
  return exclusions.filter(exc => exc.state === 'MA');
}

/**
 * Export exclusions for training
 */
async function exportForTraining(exclusions, outputPath) {
  const trainingData = exclusions.map(exc => ({
    name: exc.busName || `${exc.firstName} ${exc.lastName}`,
    npi: exc.npi,
    specialty: exc.specialty,
    state: exc.state,
    exclusionType: exc.exclType,
    exclusionDate: exc.exclDate,
    isEntity: !!(exc.busName && exc.busName.trim()),
    // Features for ML
    features: {
      hasNPI: !!exc.npi,
      specialtyRisk: getSpecialtyRiskScore(exc.specialty),
      exclusionSeverity: getExclusionSeverity(exc.exclType),
    }
  }));

  await fs.writeFile(outputPath, JSON.stringify(trainingData, null, 2));
  console.log(`Exported ${trainingData.length} records for training to ${outputPath}`);

  return trainingData;
}

/**
 * Get risk score for specialty (based on historical fraud rates)
 */
function getSpecialtyRiskScore(specialty) {
  const highRisk = [
    'home health', 'durable medical equipment', 'laboratory',
    'pharmacy', 'ambulance', 'chiropractic', 'physical therapy'
  ];
  const mediumRisk = [
    'physician', 'clinic', 'nursing', 'mental health', 'substance abuse'
  ];

  const specLower = (specialty || '').toLowerCase();

  if (highRisk.some(hr => specLower.includes(hr))) return 3;
  if (mediumRisk.some(mr => specLower.includes(mr))) return 2;
  return 1;
}

/**
 * Get severity score for exclusion type
 */
function getExclusionSeverity(exclType) {
  // Common exclusion codes:
  // 1128(a)(1) - Conviction for program-related crime
  // 1128(a)(2) - Conviction for patient abuse
  // 1128(a)(3) - Felony conviction for healthcare fraud
  // 1128(a)(4) - Felony conviction for controlled substance
  // 1128(b) - Permissive exclusions

  const type = (exclType || '').toLowerCase();

  if (type.includes('1128a1') || type.includes('1128(a)(1)')) return 5; // Program fraud
  if (type.includes('1128a2') || type.includes('1128(a)(2)')) return 5; // Patient abuse
  if (type.includes('1128a3') || type.includes('1128(a)(3)')) return 5; // Healthcare fraud felony
  if (type.includes('1128b')) return 3; // Permissive

  return 2; // Default medium
}

// Main execution
async function main() {
  try {
    const csvPath = await downloadOIGExclusions();
    const exclusions = await parseOIGExclusions(csvPath);

    // Analyze patterns
    const patterns = analyzeExclusionPatterns(exclusions);
    console.log('\n=== Exclusion Patterns ===');
    console.log('Top States:', Object.entries(patterns.byState)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10));
    console.log('By Type:', patterns.byExclusionType);
    console.log('Entity vs Individual:', patterns.entityVsIndividual);

    // Get MA exclusions
    const maExclusions = getMAExclusions(exclusions);
    console.log(`\nMassachusetts exclusions: ${maExclusions.length}`);

    // Export for training
    const trainingPath = path.join(DATA_DIR, 'oig-training-data.json');
    await exportForTraining(exclusions, trainingPath);

    // Export MA-specific
    const maTrainingPath = path.join(DATA_DIR, 'ma-exclusions.json');
    await exportForTraining(maExclusions, maTrainingPath);

    console.log('\nData collection complete!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

module.exports = {
  downloadOIGExclusions,
  parseOIGExclusions,
  analyzeExclusionPatterns,
  getMAExclusions,
  exportForTraining,
};

if (require.main === module) {
  main();
}

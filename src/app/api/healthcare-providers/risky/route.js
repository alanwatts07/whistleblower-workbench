import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Load MA exclusions
let maExclusions = null;
async function loadMAExclusions() {
  if (maExclusions) return maExclusions;
  try {
    const data = await fs.readFile(
      path.join(process.cwd(), 'src/ml/data/downloads/ma-exclusions.json'),
      'utf-8'
    );
    maExclusions = JSON.parse(data);
    return maExclusions;
  } catch (error) {
    return [];
  }
}

/**
 * GET - Return pre-computed list of risky MA healthcare providers
 */
export async function GET() {
  try {
    const exclusions = await loadMAExclusions();

    // 1. Get recent exclusions (most recent first)
    const recentExclusions = exclusions
      .filter(e => e.exclusionDate)
      .sort((a, b) => (b.exclusionDate || '').localeCompare(a.exclusionDate || ''))
      .slice(0, 25)
      .map(e => ({
        name: e.name,
        npi: e.npi,
        specialty: e.specialty || 'Unknown',
        exclusionDate: formatExclusionDate(e.exclusionDate),
        exclusionType: e.exclusionType,
        riskLevel: getRiskLevel(e.exclusionType),
        reason: getExclusionReason(e.exclusionType),
        source: 'OIG LEIE',
      }));

    // 2. Get high-risk specialty providers (home health, lab, DME, etc.)
    const highRiskSpecialties = ['HOME HEALTH', 'LABORATORY', 'DME', 'PHARMACY', 'AMBULANCE', 'PAIN', 'CHIROPRACTIC'];
    const highRiskProviders = exclusions
      .filter(e => {
        const spec = (e.specialty || '').toUpperCase();
        return highRiskSpecialties.some(hrs => spec.includes(hrs));
      })
      .slice(0, 20)
      .map(e => ({
        name: e.name,
        npi: e.npi,
        specialty: e.specialty,
        exclusionDate: formatExclusionDate(e.exclusionDate),
        exclusionType: e.exclusionType,
        riskLevel: 'High',
        reason: `High-risk specialty: ${e.specialty}`,
        source: 'OIG LEIE',
      }));

    // 3. Get entities (businesses, not individuals) - often bigger fraud
    const excludedEntities = exclusions
      .filter(e => e.isEntity)
      .slice(0, 20)
      .map(e => ({
        name: e.name,
        npi: e.npi,
        specialty: e.specialty || 'Entity',
        exclusionDate: formatExclusionDate(e.exclusionDate),
        exclusionType: e.exclusionType,
        riskLevel: 'High',
        reason: 'Excluded business entity',
        source: 'OIG LEIE',
      }));

    // 4. Try to get high Medicare billers from CMS
    let highBillers = [];
    try {
      highBillers = await getHighMedicareBillers();
    } catch (error) {
      console.log('Could not fetch Medicare billers:', error.message);
    }

    // 5. Compile statistics
    const stats = {
      totalMAExclusions: exclusions.length,
      bySpecialty: getSpecialtyBreakdown(exclusions),
      byExclusionType: getExclusionTypeBreakdown(exclusions),
      recentYear: getRecentYearCount(exclusions),
    };

    return Response.json({
      success: true,
      recentExclusions,
      highRiskProviders,
      excludedEntities,
      highBillers,
      stats,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Risky providers API error:', error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * Get high Medicare billers in MA
 */
async function getHighMedicareBillers() {
  // Query CMS for top MA billers
  const datasetId = 'mj5m-pzi6';
  const url = `https://data.cms.gov/data-api/v1/dataset/${datasetId}/data?filter[Rndrng_Prvdr_State_Abrvtn]=MA&sort=-Tot_Mdcr_Pymt_Amt&size=30`;

  try {
    const curlCommand = `curl -s --max-time 20 "${url}"`;
    const { stdout } = await execAsync(curlCommand);
    const data = JSON.parse(stdout);

    return (data || []).slice(0, 20).map(p => {
      const totalPayments = parseFloat(p.Tot_Mdcr_Pymt_Amt) || 0;
      const totalServices = parseInt(p.Tot_Srvcs) || 0;
      const beneficiaries = parseInt(p.Tot_Benes) || 0;
      const avgPerService = totalServices > 0 ? totalPayments / totalServices : 0;
      const servicesPerPatient = beneficiaries > 0 ? totalServices / beneficiaries : 0;

      return {
        name: `${p.Rndrng_Prvdr_First_Name || ''} ${p.Rndrng_Prvdr_Last_Org_Name || ''}`.trim(),
        npi: p.Rndrng_NPI,
        specialty: p.Rndrng_Prvdr_Type,
        city: p.Rndrng_Prvdr_City,
        totalPayments,
        totalServices,
        beneficiaries,
        avgPerService,
        servicesPerPatient,
        riskLevel: calculateBillerRisk(totalPayments, avgPerService, servicesPerPatient),
        source: 'CMS Medicare',
      };
    });
  } catch (error) {
    console.error('CMS API error:', error);
    return [];
  }
}

function calculateBillerRisk(totalPayments, avgPerService, servicesPerPatient) {
  let score = 0;
  if (totalPayments > 1000000) score += 2;
  if (totalPayments > 5000000) score += 2;
  if (avgPerService > 200) score += 1;
  if (servicesPerPatient > 20) score += 2;

  if (score >= 4) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

function formatExclusionDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

function getRiskLevel(exclType) {
  const type = (exclType || '').toLowerCase();
  if (type.includes('1128a1') || type.includes('1128a3')) return 'Critical';
  if (type.includes('1128a2') || type.includes('1128a4')) return 'Critical';
  if (type.includes('1128b4')) return 'High';
  return 'Medium';
}

function getExclusionReason(exclType) {
  const type = (exclType || '').toLowerCase();
  if (type.includes('1128a1')) return 'Convicted of program-related crime';
  if (type.includes('1128a2')) return 'Convicted of patient abuse/neglect';
  if (type.includes('1128a3')) return 'Felony healthcare fraud conviction';
  if (type.includes('1128a4')) return 'Felony controlled substance conviction';
  if (type.includes('1128b4')) return 'License revocation/suspension';
  if (type.includes('1128b1')) return 'Misdemeanor healthcare fraud';
  if (type.includes('1128b5')) return 'Exclusion from state program';
  if (type.includes('1128b7')) return 'Fraud/integrity violation';
  return 'Federal program exclusion';
}

function getSpecialtyBreakdown(exclusions) {
  const counts = {};
  exclusions.forEach(e => {
    const spec = e.specialty || 'Unknown';
    counts[spec] = (counts[spec] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([specialty, count]) => ({ specialty, count }));
}

function getExclusionTypeBreakdown(exclusions) {
  const counts = {};
  exclusions.forEach(e => {
    const type = e.exclusionType || 'Unknown';
    counts[type] = (counts[type] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count, reason: getExclusionReason(type) }));
}

function getRecentYearCount(exclusions) {
  const currentYear = new Date().getFullYear().toString();
  const lastYear = (new Date().getFullYear() - 1).toString();
  return exclusions.filter(e => {
    const year = (e.exclusionDate || '').substring(0, 4);
    return year === currentYear || year === lastYear;
  }).length;
}

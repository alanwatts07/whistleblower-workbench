import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// CMS Medicare Provider Data API
const CMS_PROVIDER_API = 'https://data.cms.gov/provider-data/api/1/datastore/query';

// Load MA exclusions for cross-reference
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
    console.log('MA exclusions not loaded');
    return [];
  }
}

/**
 * Search for healthcare providers in Massachusetts
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { searchType = 'providers', query = '', city = '', specialty = '' } = body;

    // Load exclusions for cross-reference
    const exclusions = await loadMAExclusions();

    if (searchType === 'medicare-payments') {
      return await searchMedicarePayments(query, city, exclusions);
    } else if (searchType === 'compare-utilization') {
      return await compareUtilization(query, specialty, exclusions);
    } else if (searchType === 'exclusion-check') {
      return await checkExclusions(query, exclusions);
    } else {
      return await searchProviders(query, city, specialty, exclusions);
    }
  } catch (error) {
    console.error('Healthcare provider API error:', error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * Search Medicare provider utilization data
 */
async function searchMedicarePayments(providerName, city, exclusions) {
  // CMS Medicare Physician & Other Practitioners dataset
  // This contains actual payment data
  const datasetId = 'mj5m-pzi6'; // Medicare Physician Utilization

  try {
    // Search for provider in CMS data
    const searchUrl = `https://data.cms.gov/data-api/v1/dataset/${datasetId}/data?filter[Rndrng_Prvdr_State_Abrvtn]=MA&size=100`;

    const curlCommand = `curl -s --max-time 30 "${searchUrl}"`;
    const { stdout } = await execAsync(curlCommand);
    const data = JSON.parse(stdout);

    // Filter by provider name if specified
    let results = data || [];
    if (providerName) {
      const searchLower = providerName.toLowerCase();
      results = results.filter(r =>
        (r.Rndrng_Prvdr_Last_Org_Name || '').toLowerCase().includes(searchLower) ||
        (r.Rndrng_Prvdr_First_Name || '').toLowerCase().includes(searchLower)
      );
    }

    // Analyze each provider
    const analyzed = results.slice(0, 50).map(provider => {
      const totalPayments = parseFloat(provider.Tot_Mdcr_Pymt_Amt) || 0;
      const totalServices = parseInt(provider.Tot_Srvcs) || 0;
      const beneficiaries = parseInt(provider.Tot_Benes) || 0;

      // Calculate risk indicators
      const avgPaymentPerService = totalServices > 0 ? totalPayments / totalServices : 0;
      const servicesPerBeneficiary = beneficiaries > 0 ? totalServices / beneficiaries : 0;

      // Check against exclusions
      const providerName = `${provider.Rndrng_Prvdr_First_Name || ''} ${provider.Rndrng_Prvdr_Last_Org_Name || ''}`.trim();
      const isExcluded = checkAgainstExclusions(providerName, provider.Rndrng_NPI, exclusions);

      return {
        npi: provider.Rndrng_NPI,
        name: providerName,
        specialty: provider.Rndrng_Prvdr_Type,
        city: provider.Rndrng_Prvdr_City,
        state: provider.Rndrng_Prvdr_State_Abrvtn,
        totalPayments,
        totalServices,
        beneficiaries,
        avgPaymentPerService,
        servicesPerBeneficiary,
        isExcluded,
        riskIndicators: calculateProviderRisk(provider, avgPaymentPerService, servicesPerBeneficiary, isExcluded),
      };
    });

    return Response.json({
      success: true,
      results: analyzed.sort((a, b) => b.totalPayments - a.totalPayments),
      totalFound: results.length,
      source: 'CMS Medicare Physician Utilization Data',
    });
  } catch (error) {
    console.error('Medicare payment search error:', error);
    // Return empty results with error info
    return Response.json({
      success: true,
      results: [],
      totalFound: 0,
      error: 'CMS API temporarily unavailable',
      source: 'CMS Medicare Physician Utilization Data',
    });
  }
}

/**
 * Search for providers and cross-reference with exclusions
 */
async function searchProviders(query, city, specialty, exclusions) {
  // Use NPPES NPI Registry for provider search
  const baseUrl = 'https://npiregistry.cms.hhs.gov/api/';

  let searchParams = new URLSearchParams({
    version: '2.1',
    state: 'MA',
    limit: 100,
  });

  if (query) {
    // Check if it's an organization or individual name
    if (query.includes(' ') || query.length > 20) {
      searchParams.append('organization_name', query);
    } else {
      searchParams.append('last_name', query);
    }
  }
  if (city) searchParams.append('city', city);
  if (specialty) searchParams.append('taxonomy_description', specialty);

  try {
    const curlCommand = `curl -s --max-time 30 "${baseUrl}?${searchParams.toString()}"`;
    const { stdout } = await execAsync(curlCommand);
    const data = JSON.parse(stdout);

    const results = (data.results || []).map(provider => {
      const basic = provider.basic || {};
      const addresses = provider.addresses || [];
      const taxonomies = provider.taxonomies || [];

      const name = basic.organization_name ||
        `${basic.first_name || ''} ${basic.last_name || ''}`.trim();

      const isExcluded = checkAgainstExclusions(name, provider.number, exclusions);

      return {
        npi: provider.number,
        name,
        entityType: provider.enumeration_type,
        specialty: taxonomies[0]?.desc || 'Unknown',
        address: addresses[0] ? `${addresses[0].city}, ${addresses[0].state}` : 'Unknown',
        phone: addresses[0]?.telephone_number,
        isExcluded,
        exclusionDetails: isExcluded ? getExclusionDetails(name, provider.number, exclusions) : null,
      };
    });

    return Response.json({
      success: true,
      results,
      totalFound: data.result_count || results.length,
      source: 'NPPES NPI Registry',
    });
  } catch (error) {
    console.error('Provider search error:', error);
    return Response.json({
      success: true,
      results: [],
      totalFound: 0,
      error: 'NPPES API temporarily unavailable',
    });
  }
}

/**
 * Check provider against exclusions list
 */
async function checkExclusions(query, exclusions) {
  const searchLower = query.toLowerCase();

  const matches = exclusions.filter(exc => {
    const excName = (exc.name || '').toLowerCase();
    return excName.includes(searchLower) || searchLower.includes(excName);
  });

  return Response.json({
    success: true,
    results: matches.map(m => ({
      name: m.name,
      npi: m.npi,
      specialty: m.specialty,
      state: m.state,
      exclusionType: m.exclusionType,
      exclusionDate: m.exclusionDate,
      riskScore: m.features?.exclusionSeverity === 5 ? 'Critical' : 'High',
    })),
    totalFound: matches.length,
    source: 'HHS OIG LEIE Database',
  });
}

/**
 * Check if provider is in exclusions list
 */
function checkAgainstExclusions(name, npi, exclusions) {
  if (!exclusions || exclusions.length === 0) return false;

  const nameLower = (name || '').toLowerCase();

  return exclusions.some(exc => {
    if (npi && exc.npi === npi) return true;
    const excName = (exc.name || '').toLowerCase();
    // Fuzzy match on name
    return excName.includes(nameLower) || nameLower.includes(excName);
  });
}

/**
 * Get exclusion details for a provider
 */
function getExclusionDetails(name, npi, exclusions) {
  const nameLower = (name || '').toLowerCase();

  const match = exclusions.find(exc => {
    if (npi && exc.npi === npi) return true;
    const excName = (exc.name || '').toLowerCase();
    return excName.includes(nameLower) || nameLower.includes(excName);
  });

  return match ? {
    exclusionType: match.exclusionType,
    exclusionDate: match.exclusionDate,
    specialty: match.specialty,
  } : null;
}

/**
 * Calculate provider risk indicators
 */
function calculateProviderRisk(provider, avgPaymentPerService, servicesPerBeneficiary, isExcluded) {
  const indicators = [];
  let riskScore = 0;

  // Exclusion is highest risk
  if (isExcluded) {
    indicators.push({
      type: 'EXCLUDED_PROVIDER',
      severity: 'critical',
      description: 'Provider appears on OIG exclusion list',
    });
    riskScore += 50;
  }

  // High payment per service (potential upcoding)
  if (avgPaymentPerService > 200) {
    indicators.push({
      type: 'HIGH_PAYMENT_PER_SERVICE',
      severity: 'medium',
      description: `Avg $${avgPaymentPerService.toFixed(2)} per service`,
    });
    riskScore += 15;
  }

  // High services per beneficiary (potential overutilization)
  if (servicesPerBeneficiary > 20) {
    indicators.push({
      type: 'HIGH_SERVICE_VOLUME',
      severity: 'medium',
      description: `${servicesPerBeneficiary.toFixed(1)} services per patient`,
    });
    riskScore += 15;
  }

  // High-risk specialties
  const highRiskSpecialties = ['home health', 'laboratory', 'dme', 'pharmacy', 'pain management', 'psychiatry'];
  const specialty = (provider.Rndrng_Prvdr_Type || '').toLowerCase();
  if (highRiskSpecialties.some(s => specialty.includes(s))) {
    indicators.push({
      type: 'HIGH_RISK_SPECIALTY',
      severity: 'low',
      description: `High-risk specialty: ${provider.Rndrng_Prvdr_Type}`,
    });
    riskScore += 10;
  }

  return {
    score: Math.min(riskScore, 100),
    level: riskScore >= 50 ? 'High' : riskScore >= 25 ? 'Medium' : 'Low',
    indicators,
  };
}

/**
 * GET - Return MA exclusions summary
 */
export async function GET() {
  try {
    const exclusions = await loadMAExclusions();

    // Summarize by specialty
    const bySpecialty = {};
    const byCity = {};

    exclusions.forEach(exc => {
      const specialty = exc.specialty || 'Unknown';
      bySpecialty[specialty] = (bySpecialty[specialty] || 0) + 1;

      // Extract city from name or address if available
      const state = exc.state || 'MA';
      byCity[state] = (byCity[state] || 0) + 1;
    });

    return Response.json({
      success: true,
      totalExclusions: exclusions.length,
      bySpecialty: Object.entries(bySpecialty)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([specialty, count]) => ({ specialty, count })),
      recentExclusions: exclusions
        .filter(e => e.exclusionDate)
        .sort((a, b) => (b.exclusionDate || '').localeCompare(a.exclusionDate || ''))
        .slice(0, 10),
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

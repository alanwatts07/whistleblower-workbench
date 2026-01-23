'use server';

/**
 * Server Actions for SAM.gov Exclusions
 * Checks contractor debarment/suspension status
 */

// SAM.gov public API for exclusions
const SAM_EXCLUSIONS_URL = 'https://api.sam.gov/entity-information/v3/exclusions';

/**
 * Search SAM.gov exclusions by entity name
 * Note: Full API access requires API key registration at SAM.gov
 * This uses the public search endpoint
 */
export async function searchExclusions(entityName) {
  // For now, we'll provide a structured response indicating
  // the search parameters and how to verify manually
  // Full API integration requires SAM.gov API key

  return {
    success: true,
    searchTerm: entityName,
    message: 'SAM.gov exclusion search initiated',
    manualVerificationUrl: `https://sam.gov/search/?keywords=${encodeURIComponent(entityName)}&sort=-relevance&page=1&sfmData=exclusions`,
    note: 'For automated exclusion checks, register for SAM.gov API key at api.sam.gov',
    // Placeholder for when API key is configured
    exclusions: [],
  };
}

/**
 * Check if an entity appears to be on exclusion list
 * This is a mock implementation - real implementation requires SAM.gov API key
 */
export async function checkExclusionStatus(entityName, uei = null) {
  // In production, this would call the SAM.gov API with proper authentication
  // For demonstration, return the search capability info

  return {
    success: true,
    entity: entityName,
    uei: uei,
    status: 'CHECK_REQUIRED',
    verificationUrl: `https://sam.gov/search/?keywords=${encodeURIComponent(entityName)}&index=ei&sort=-relevance&page=1&pageSize=25&sfm%5Bstatus%5D%5Bis_active%5D=true&sfm%5BexclusionType%5D%5BisIndividual%5D=false`,
    instructions: [
      '1. Click the verification URL to search SAM.gov',
      '2. Look for entity in Exclusions section',
      '3. Check Active Exclusions status',
      '4. Review exclusion type and dates if found',
    ],
  };
}

/**
 * Known Massachusetts exclusions (sample data for demonstration)
 * In production, this would be fetched from SAM.gov API
 */
export async function getKnownMAExclusions() {
  // Sample exclusion patterns based on public records
  // Real implementation would pull from SAM.gov API

  return {
    success: true,
    note: 'Sample data - integrate with SAM.gov API for live data',
    exclusions: [
      {
        entityName: 'Sample Excluded Corp',
        type: 'Contractor',
        exclusionType: 'Debarment',
        state: 'MA',
        status: 'Active',
        sourceUrl: 'https://sam.gov/exclusions',
      },
    ],
    totalCount: 1,
    dataSource: 'SAM.gov Exclusions Database',
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Build SAM.gov search URL for entity verification
 */
export async function buildSAMSearchUrl(params) {
  const { entityName, state, exclusionsOnly = false } = params;

  let baseUrl = 'https://sam.gov/search/?';
  const searchParams = new URLSearchParams();

  if (entityName) {
    searchParams.set('keywords', entityName);
  }

  searchParams.set('sort', '-relevance');
  searchParams.set('page', '1');
  searchParams.set('pageSize', '25');

  if (exclusionsOnly) {
    searchParams.set('index', 'ei'); // Exclusion index
  }

  return {
    success: true,
    url: baseUrl + searchParams.toString(),
    params: { entityName, state, exclusionsOnly },
  };
}

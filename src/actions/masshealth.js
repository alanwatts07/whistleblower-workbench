'use server';

/**
 * Server Actions for MassHealth Provider Data
 * Checks Massachusetts Medicaid exclusions and provider status
 */

/**
 * Get MassHealth exclusions search info
 * The actual list is a PDF/document updated monthly by Mass.gov
 */
export async function getMassHealthExclusionsInfo() {
  return {
    success: true,
    dataSource: 'Massachusetts Executive Office of Health and Human Services',
    exclusionsListUrl: 'https://www.mass.gov/info-details/learn-about-suspended-or-excluded-masshealth-providers',
    downloadUrl: 'https://www.mass.gov/doc/list-of-suspended-or-excluded-masshealth-providers',
    updateFrequency: 'Monthly',
    description: 'List of providers suspended or excluded from MassHealth program',
    categories: [
      'Medicare Suspension (federal action binding on MA)',
      'License Revocation by State Board',
      'Criminal Conviction (healthcare-related)',
      'Debarment (disciplinary action)',
    ],
    instructions: [
      '1. Download the current exclusions list from Mass.gov',
      '2. Search for the provider name or NPI',
      '3. Check exclusion reason and effective date',
      '4. Verify if exclusion is still active',
    ],
  };
}

/**
 * Build verification links for a Massachusetts provider
 */
export async function getMAProviderVerificationLinks(providerName, npi = null) {
  const encodedName = encodeURIComponent(providerName);

  return {
    success: true,
    provider: providerName,
    npi,
    verificationLinks: {
      massHealthExclusions: {
        name: 'MassHealth Exclusions',
        url: 'https://www.mass.gov/info-details/learn-about-suspended-or-excluded-masshealth-providers',
        description: 'Check if provider is excluded from MassHealth',
      },
      federalOIGExclusions: {
        name: 'Federal OIG LEIE',
        url: `https://exclusions.oig.hhs.gov/`,
        description: 'Federal exclusion database (searchable)',
      },
      npiRegistry: {
        name: 'NPI Registry',
        url: npi
          ? `https://npiregistry.cms.hhs.gov/provider-view/${npi}`
          : `https://npiregistry.cms.hhs.gov/search`,
        description: 'Verify provider NPI and practice information',
      },
      maLicenseVerification: {
        name: 'MA License Verification',
        url: 'https://www.mass.gov/orgs/board-of-registration-in-medicine',
        description: 'Verify MA medical license status',
      },
      openPayments: {
        name: 'CMS Open Payments',
        url: `https://openpaymentsdata.cms.gov/search/physicians/by-name-and-location`,
        description: 'Check pharmaceutical company payments',
      },
    },
  };
}

/**
 * Known high-risk provider patterns in Massachusetts
 * Based on recent AG enforcement actions
 */
export async function getMAHighRiskPatterns() {
  return {
    success: true,
    lastUpdated: '2025-01',
    source: 'Massachusetts Attorney General enforcement actions',
    highRiskProviderTypes: [
      {
        type: 'Ambulance/Medical Transportation',
        riskLevel: 'High',
        recentCases: 3,
        commonSchemes: [
          'Billing for trips not made',
          'Billing non-emergency as emergency',
          'Patient staging/farming',
        ],
        recentSettlement: '$6M (Weymouth ambulance companies, 2025)',
      },
      {
        type: 'Home Health Agencies',
        riskLevel: 'High',
        recentCases: 2,
        commonSchemes: [
          'Phantom visits',
          'Kickbacks to labs for referrals',
          'Billing for unlicensed staff',
        ],
        recentSettlement: '$7.8M indictment (2025 kickback scheme)',
      },
      {
        type: 'Laboratories',
        riskLevel: 'High',
        recentCases: 2,
        commonSchemes: [
          'Kickbacks to referring providers',
          'Unnecessary confirmatory testing',
          'Unbundled panels',
        ],
        recentSettlement: 'Part of $7.8M scheme (2025)',
      },
      {
        type: 'Outpatient Mental Health',
        riskLevel: 'Medium',
        recentCases: 1,
        commonSchemes: [
          'Upcoding visit complexity',
          'Group billed as individual',
          'Unlicensed practitioners',
        ],
        recentSettlement: '$4.6M (2024)',
      },
      {
        type: 'Substance Abuse Treatment',
        riskLevel: 'Medium',
        recentCases: 1,
        commonSchemes: [
          'Excessive urine drug screens',
          'Upcoding E&M visits',
          'Patient brokering',
        ],
        recentSettlement: '$2M - SaVida Health (2024)',
      },
      {
        type: 'Pharmaceutical Companies',
        riskLevel: 'Medium',
        recentCases: 1,
        commonSchemes: [
          'Kickbacks to prescribers',
          'Off-label promotion',
          'Best price violations',
        ],
        recentSettlement: '$1.4M MA share - QOL Medical (2025)',
      },
    ],
    redFlagsToWatch: [
      'Provider billing patterns significantly above peers',
      'High percentage of maximum-reimbursement codes',
      'Unusual referral patterns (concentrated sources/destinations)',
      'Rapid growth in claims volume',
      'History of exclusions or license discipline',
      'Related parties with exclusion history',
      'Payments from pharmaceutical companies (Open Payments)',
    ],
  };
}

/**
 * Recent Massachusetts FCA settlements for reference
 */
export async function getRecentMASettlements() {
  return {
    success: true,
    settlements: [
      {
        date: '2025-08',
        defendant: 'Weymouth Ambulance Companies',
        amount: 6000000,
        allegation: 'False claims to MassHealth',
        type: 'Medical Transportation',
        source: 'Mass.gov AG',
      },
      {
        date: '2025-03',
        defendant: 'Home Health/Lab Kickback Defendants',
        amount: 7800000,
        allegation: 'Kickbacks, false billing, money laundering',
        type: 'Home Health/Laboratory',
        source: 'Mass.gov AG (indictment)',
      },
      {
        date: '2025-02',
        defendant: 'QOL Medical, LLC',
        amount: 1400000,
        allegation: 'Kickbacks to laboratory for Sucraid purchases',
        type: 'Pharmaceutical',
        source: 'Mass.gov AG (part of $47M national)',
      },
      {
        date: '2024-12',
        defendant: 'SaVida Health PC',
        amount: 2000000,
        allegation: 'Upcoding, unnecessary drug tests',
        type: 'Substance Abuse Treatment',
        source: 'Mass.gov AG',
      },
      {
        date: '2024',
        defendant: 'Universal Health Services',
        amount: 15000000,
        allegation: 'Whistleblower case - details pending',
        type: 'Healthcare System',
        source: 'Mass.gov AG',
      },
      {
        date: '2024-02',
        defendant: 'North Dartmouth Ambulance Companies',
        amount: 1600000,
        allegation: 'False claims to MassHealth',
        type: 'Medical Transportation',
        source: 'Mass.gov AG',
      },
    ],
    totalRecovered: 33800000,
    note: 'Massachusetts AG actively pursuing MassHealth fraud cases',
  };
}

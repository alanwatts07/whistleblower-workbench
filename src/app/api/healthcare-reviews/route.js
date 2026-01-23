import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Search for healthcare provider reviews mentioning billing issues
 * Uses web scraping approach to find Google/Yelp reviews
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { providerName, city = 'Massachusetts' } = body;

    if (!providerName) {
      return Response.json({
        success: false,
        error: 'Provider name is required',
      }, { status: 400 });
    }

    // Search terms that indicate billing fraud/issues
    const billingKeywords = [
      'overcharged',
      'billing issue',
      'surprise bill',
      'charged too much',
      'insurance fraud',
      'fraudulent charges',
      'unnecessary charges',
      'misbilled',
      'wrong bill',
      'unexpected charges',
      'balance billing',
      'out of network',
      'denied claim',
    ];

    // Build search query for Google
    const searchQuery = `"${providerName}" ${city} reviews (${billingKeywords.slice(0, 5).join(' OR ')})`;

    // Use DuckDuckGo HTML search (no API key needed)
    const encodedQuery = encodeURIComponent(searchQuery);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    try {
      const curlCommand = `curl -s --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${searchUrl}"`;
      const { stdout } = await execAsync(curlCommand);

      // Parse HTML results
      const results = parseSearchResults(stdout, providerName, billingKeywords);

      // Also search specifically for Yelp reviews
      const yelpResults = await searchYelpMentions(providerName, city, billingKeywords);

      return Response.json({
        success: true,
        providerName,
        searchTerms: billingKeywords,
        webMentions: results,
        yelpMentions: yelpResults,
        summary: generateReviewSummary(results, yelpResults),
      });
    } catch (searchError) {
      console.error('Search error:', searchError);
      return Response.json({
        success: true,
        providerName,
        webMentions: [],
        yelpMentions: [],
        summary: {
          billingComplaintScore: 0,
          totalMentions: 0,
          riskLevel: 'Unknown',
          note: 'Unable to search reviews at this time',
        },
      });
    }
  } catch (error) {
    console.error('Healthcare reviews API error:', error);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * Parse DuckDuckGo HTML search results
 */
function parseSearchResults(html, providerName, keywords) {
  const results = [];

  // Extract result snippets using regex
  const resultMatches = html.matchAll(/class="result__snippet"[^>]*>([^<]+)</g);

  for (const match of resultMatches) {
    const snippet = match[1];
    const snippetLower = snippet.toLowerCase();

    // Check if snippet mentions billing issues
    const matchedKeywords = keywords.filter(kw => snippetLower.includes(kw.toLowerCase()));

    if (matchedKeywords.length > 0) {
      results.push({
        snippet: snippet.substring(0, 300),
        matchedKeywords,
        relevance: matchedKeywords.length,
      });
    }
  }

  // Also extract titles/links
  const titleMatches = html.matchAll(/class="result__title"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)</g);

  for (const match of titleMatches) {
    const url = match[1];
    const title = match[2];

    // Check if it's a review site
    if (url.includes('yelp') || url.includes('google') || url.includes('healthgrades') ||
        url.includes('vitals') || url.includes('zocdoc') || url.includes('reviews')) {
      results.push({
        title: title.substring(0, 100),
        url: decodeURIComponent(url.replace(/.*uddg=/, '').split('&')[0]),
        type: 'review_site',
        relevance: 1,
      });
    }
  }

  return results.slice(0, 10);
}

/**
 * Search for Yelp mentions of billing issues
 */
async function searchYelpMentions(providerName, city, keywords) {
  const searchQuery = `site:yelp.com "${providerName}" ${city} billing`;
  const encodedQuery = encodeURIComponent(searchQuery);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  try {
    const curlCommand = `curl -s --max-time 10 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${searchUrl}"`;
    const { stdout } = await execAsync(curlCommand);

    const results = [];
    const snippetMatches = stdout.matchAll(/class="result__snippet"[^>]*>([^<]+)</g);

    for (const match of snippetMatches) {
      const snippet = match[1];
      const snippetLower = snippet.toLowerCase();

      // Check for billing-related mentions
      const hasBillingMention = keywords.some(kw => snippetLower.includes(kw.toLowerCase()));
      const hasNegativeSentiment = /worst|terrible|avoid|scam|rip.?off|never.?again|horrible/i.test(snippet);

      if (hasBillingMention || hasNegativeSentiment) {
        results.push({
          snippet: snippet.substring(0, 300),
          source: 'Yelp',
          hasBillingIssue: hasBillingMention,
          hasNegativeSentiment,
        });
      }
    }

    return results.slice(0, 5);
  } catch (error) {
    console.error('Yelp search error:', error);
    return [];
  }
}

/**
 * Generate a summary of review findings
 */
function generateReviewSummary(webMentions, yelpMentions) {
  const totalMentions = webMentions.length + yelpMentions.length;
  const billingMentions = webMentions.filter(r => r.matchedKeywords?.length > 0).length +
                          yelpMentions.filter(r => r.hasBillingIssue).length;

  let riskLevel = 'Low';
  let billingComplaintScore = 0;

  if (billingMentions >= 5) {
    riskLevel = 'High';
    billingComplaintScore = 75;
  } else if (billingMentions >= 2) {
    riskLevel = 'Medium';
    billingComplaintScore = 50;
  } else if (billingMentions >= 1) {
    riskLevel = 'Low';
    billingComplaintScore = 25;
  }

  // Boost score for negative sentiment
  const negativeMentions = yelpMentions.filter(r => r.hasNegativeSentiment).length;
  billingComplaintScore += negativeMentions * 10;
  billingComplaintScore = Math.min(billingComplaintScore, 100);

  if (billingComplaintScore >= 60) riskLevel = 'High';

  return {
    totalMentions,
    billingMentions,
    billingComplaintScore,
    riskLevel,
    recommendation: billingMentions > 0
      ? 'Found billing-related complaints. Consider investigating further.'
      : 'No significant billing complaints found in online reviews.',
  };
}

/**
 * GET - Return common billing fraud indicators to search for
 */
export async function GET() {
  return Response.json({
    success: true,
    billingFraudIndicators: [
      {
        term: 'overcharged',
        description: 'Patient reports being charged more than expected',
        severity: 'high',
      },
      {
        term: 'surprise bill',
        description: 'Unexpected charges after visit',
        severity: 'medium',
      },
      {
        term: 'unnecessary tests',
        description: 'Tests or procedures patient felt were not needed',
        severity: 'high',
      },
      {
        term: 'balance billing',
        description: 'Billing for amounts insurance didnt cover',
        severity: 'medium',
      },
      {
        term: 'out of network',
        description: 'Surprise out-of-network charges',
        severity: 'medium',
      },
      {
        term: 'fraudulent',
        description: 'Explicit fraud allegations',
        severity: 'critical',
      },
      {
        term: 'insurance fraud',
        description: 'Reports of insurance billing issues',
        severity: 'critical',
      },
      {
        term: 'double billing',
        description: 'Charged multiple times for same service',
        severity: 'high',
      },
    ],
    highRiskSpecialties: [
      'Pain Management',
      'Laboratory',
      'Home Health',
      'Durable Medical Equipment',
      'Substance Abuse Treatment',
      'Psychiatry',
      'Physical Therapy',
      'Ambulance Services',
    ],
  });
}

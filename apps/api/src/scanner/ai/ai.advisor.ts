import { Finding, ScoreGrade } from '@wsc/shared';

export interface ActionPlanItem {
  priority: number;
  title: string;
  description: string;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  category: string;
}

export interface AiExplanationResult {
  executiveSummary: string;
  actionPlan: ActionPlanItem[];
  modelVersion: string;
}

/**
 * Generates an executive summary and prioritized action plan.
 * Operates strictly on deterministic findings with zero hallucination.
 * Provides deterministic synthesis by default, with optional LLM augmentation if API key is present.
 */
export async function generateAiExplanation(
  domain: string,
  score: number,
  grade: ScoreGrade,
  findings: Finding[]
): Promise<AiExplanationResult> {
  const apiKey = process.env.AI_API_KEY;

  if (apiKey) {
    try {
      return await callLlmAdvisor(domain, score, grade, findings, apiKey);
    } catch {
      // Fallback to deterministic synthesis if external API fails
    }
  }

  return generateDeterministicSummary(domain, score, grade, findings);
}

function generateDeterministicSummary(
  domain: string,
  score: number,
  grade: ScoreGrade,
  findings: Finding[]
): AiExplanationResult {
  const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;

  let summaryParagraph = '';

  if (grade === 'A') {
    summaryParagraph = `Assessment for ${domain} demonstrates an exemplary external security posture with a Grade A rating (${score}/100). Essential cryptographic transport controls and security policies are active, minimizing exposure to common automated web attacks.`;
  } else if (grade === 'B') {
    summaryParagraph = `Assessment for ${domain} demonstrates a solid defensive configuration (Grade B, ${score}/100) with minor gaps identified. Core transport layer encryption is properly configured, but implementing recommended defense-in-depth headers will elevate overall protection.`;
  } else if (grade === 'C') {
    summaryParagraph = `Assessment for ${domain} identifies notable security configuration deficiencies (Grade C, ${score}/100). The website is missing key modern browser hardening headers and email spoofing protections, increasing exposure to clickjacking and domain spoofing.`;
  } else if (grade === 'D') {
    summaryParagraph = `Assessment for ${domain} reveals significant security exposure (Grade D, ${score}/100). The presence of ${criticalCount > 0 ? `${criticalCount} critical finding(s)` : `${highCount} high-severity issue(s)`} leaves visitors and data transmission susceptible to transport downgrade or interception. Immediate remediation is strongly advised.`;
  } else {
    summaryParagraph = `Assessment for ${domain} identified critical configuration failures (Grade F, ${score}/100). Critical issues such as missing HTTPS, expired cryptographic certificates, or severely insecure domain policies require urgent engineering attention before production use.`;
  }

  // Generate prioritized action plan from findings
  const sortedFindings = [...findings].sort((a, b) => {
    const sevWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
    return sevWeight[b.severity] - sevWeight[a.severity];
  });

  const actionPlan: ActionPlanItem[] = [];
  let priorityCounter = 1;

  for (const finding of sortedFindings.slice(0, 5)) {
    let effort: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (finding.ruleId === 'HDR-MISSING-CSP' || finding.ruleId === 'HDR-INSECURE-CSP') {
      effort = 'MEDIUM';
    } else if (finding.ruleId === 'TLS-NO-HTTPS') {
      effort = 'HIGH';
    }

    actionPlan.push({
      priority: priorityCounter++,
      title: finding.title,
      description: finding.recommendation,
      effort,
      category: finding.category,
    });
  }

  return {
    executiveSummary: summaryParagraph,
    actionPlan,
    modelVersion: 'rule-based-deterministic-v1',
  };
}

async function callLlmAdvisor(
  domain: string,
  score: number,
  grade: ScoreGrade,
  findings: Finding[],
  apiKey: string
): Promise<AiExplanationResult> {
  const endpoint = process.env.AI_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  const simplifiedFindings = findings.map((f) => ({
    title: f.title,
    severity: f.severity,
    category: f.category,
    whyItMatters: f.whyItMatters,
  }));

  const systemPrompt = `You are a cybersecurity advisor explaining verified web configuration check results for domain "${domain}".
You are provided with verified, deterministic findings.
CRITICAL CONSTRAINTS:
1. ONLY reference findings listed in the input. Never invent, extrapolate, or hallucinate vulnerabilities (no SQL injection, XSS exploitation, RCE, etc.).
2. Return strictly valid JSON matching this schema:
{
  "executiveSummary": "2-3 sentences summarizing the overall security posture and risk level",
  "actionPlan": [
    {
      "priority": 1,
      "title": "Action title",
      "description": "Short explanation of what to fix and how",
      "effort": "LOW" | "MEDIUM" | "HIGH",
      "category": "category name"
    }
  ]
}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({ domain, score, grade, findings: simplifiedFindings }),
        },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    throw new Error(`AI API responded with status ${res.status}`);
  }

  const json: any = await res.json();
  const parsed = JSON.parse(json.choices[0].message.content);

  return {
    executiveSummary: parsed.executiveSummary,
    actionPlan: parsed.actionPlan || [],
    modelVersion: model,
  };
}

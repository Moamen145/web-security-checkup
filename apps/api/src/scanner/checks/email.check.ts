import dns from 'node:dns/promises';
import { CheckModuleExecutionResult } from '@wsc/shared';

const COMMON_DKIM_SELECTORS = ['default', 'google', 'k1', 'selector1', 'mail'];

export async function runEmailSecurityCheck(domain: string): Promise<CheckModuleExecutionResult> {
  const startTime = Date.now();
  const findings: Array<{ ruleId: string; customDescription?: string; customEvidence?: Record<string, any> }> = [];
  const evidence: Record<string, any> = {
    domain,
    mxRecords: [],
    spfRecord: null,
    dmarcRecord: null,
    dkimDetected: [],
  };

  try {
    // 1. MX Records
    try {
      const mx = await dns.resolveMx(domain);
      evidence.mxRecords = mx.sort((a, b) => a.priority - b.priority);
    } catch {
      evidence.mxRecords = [];
    }

    if (evidence.mxRecords.length === 0) {
      findings.push({
        ruleId: 'EMAIL-NO-MX',
        customDescription: `No Mail Exchange (MX) records found for ${domain}.`,
        customEvidence: { mxCount: 0 },
      });
    }

    // 2. SPF Record from root domain TXT records
    try {
      const txtRecords = await dns.resolveTxt(domain);
      const flattenedTxt = txtRecords.map((chunk) => chunk.join(''));
      const spf = flattenedTxt.find((r) => r.toLowerCase().startsWith('v=spf1'));

      if (!spf) {
        findings.push({
          ruleId: 'EMAIL-MISSING-SPF',
          customEvidence: { txtCount: flattenedTxt.length },
        });
      } else {
        evidence.spfRecord = spf;
        if (spf.includes('+all')) {
          findings.push({
            ruleId: 'EMAIL-PERMISSIVE-SPF',
            customDescription: `The SPF record contains "+all", allowing any server to send emails as ${domain}.`,
            customEvidence: { rawSpf: spf },
          });
        }
      }
    } catch {
      findings.push({
        ruleId: 'EMAIL-MISSING-SPF',
        customEvidence: { error: 'Failed to resolve TXT records' },
      });
    }

    // 3. DMARC Record from _dmarc.<domain>
    try {
      const dmarcTxt = await dns.resolveTxt(`_dmarc.${domain}`);
      const flattenedDmarc = dmarcTxt.map((chunk) => chunk.join('')).find((r) => r.toLowerCase().startsWith('v=dmarc1'));

      if (!flattenedDmarc) {
        findings.push({
          ruleId: 'EMAIL-MISSING-DMARC',
          customEvidence: { dmarcQuery: `_dmarc.${domain}` },
        });
      } else {
        evidence.dmarcRecord = flattenedDmarc;
        // Check policy tag: p=none, p=quarantine, p=reject
        const policyMatch = flattenedDmarc.match(/p=([a-z]+)/i);
        const policy = policyMatch ? policyMatch[1].toLowerCase() : 'none';
        evidence.dmarcPolicy = policy;

        if (policy === 'none') {
          findings.push({
            ruleId: 'EMAIL-DMARC-NONE',
            customDescription: `DMARC policy is set to "p=none" (monitoring only). Spoofed emails are not rejected or quarantined.`,
            customEvidence: { rawDmarc: flattenedDmarc, policy },
          });
        }
      }
    } catch {
      findings.push({
        ruleId: 'EMAIL-MISSING-DMARC',
        customEvidence: { dmarcQuery: `_dmarc.${domain}`, error: 'No _dmarc TXT record found' },
      });
    }

    // 4. DKIM Selector Discovery Heuristic
    for (const selector of COMMON_DKIM_SELECTORS) {
      try {
        const dkimQuery = `${selector}._domainkey.${domain}`;
        const dkimTxt = await dns.resolveTxt(dkimQuery);
        const record = dkimTxt.map((c) => c.join('')).find((r) => r.toLowerCase().includes('v=dkim1') || r.includes('p='));
        if (record) {
          evidence.dkimDetected.push({ selector, record });
        }
      } catch {
        // Selector not present
      }
    }

    const status = findings.some((f) => f.ruleId === 'EMAIL-PERMISSIVE-SPF')
      ? 'FAIL'
      : findings.some((f) => f.ruleId === 'EMAIL-MISSING-DMARC' || f.ruleId === 'EMAIL-MISSING-SPF')
        ? 'WARN'
        : 'PASS';

    return {
      module: 'EMAIL_SECURITY',
      status,
      executionTimeMs: Date.now() - startTime,
      evidence,
      findings,
    };
  } catch (err: any) {
    return {
      module: 'EMAIL_SECURITY',
      status: 'ERROR',
      executionTimeMs: Date.now() - startTime,
      evidence: { error: err.message },
      findings,
      error: err.message,
    };
  }
}

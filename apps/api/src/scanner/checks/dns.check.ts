import dns from 'node:dns/promises';
import { CheckModuleExecutionResult } from '@wsc/shared';

export async function runDnsCheck(domain: string): Promise<CheckModuleExecutionResult> {
  const startTime = Date.now();
  const findings: Array<{ ruleId: string; customDescription?: string; customEvidence?: Record<string, any> }> = [];
  const evidence: Record<string, any> = {
    domain,
    aRecords: [],
    aaaaRecords: [],
    cnameRecords: [],
  };

  try {
    try {
      evidence.aRecords = await dns.resolve4(domain);
    } catch {
      // No IPv4 records
    }

    try {
      evidence.aaaaRecords = await dns.resolve6(domain);
    } catch {
      // No IPv6 records
    }

    try {
      evidence.cnameRecords = await dns.resolveCname(domain);
    } catch {
      // Not a CNAME
    }

    const hasIp = evidence.aRecords.length > 0 || evidence.aaaaRecords.length > 0;
    if (!hasIp) {
      findings.push({
        ruleId: 'DNS-NO-RECORDS',
        customDescription: `Domain "${domain}" does not resolve to any active A or AAAA address records.`,
        customEvidence: { domain },
      });
    }

    const status = findings.length > 0 ? 'FAIL' : 'PASS';

    return {
      module: 'DNS',
      status,
      executionTimeMs: Date.now() - startTime,
      evidence,
      findings,
    };
  } catch (err: any) {
    return {
      module: 'DNS',
      status: 'ERROR',
      executionTimeMs: Date.now() - startTime,
      evidence: { error: err.message },
      findings,
      error: err.message,
    };
  }
}

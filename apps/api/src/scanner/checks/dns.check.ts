import dns from 'node:dns/promises';
import { CheckModuleExecutionResult, ScannerCheckMeta } from '@wsc/shared';
import { IScannerCheck, CheckExecutionContext } from '../engine/check.interface.js';

export async function runDnsCheck(
  domain: string,
  options?: { signal?: AbortSignal }
): Promise<CheckModuleExecutionResult> {
  const startTime = Date.now();
  if (options?.signal?.aborted) {
    throw new Error('The operation was aborted');
  }

  const findings: Array<{ ruleId: string; customDescription?: string; customEvidence?: Record<string, any> }> = [];
  const evidence: Record<string, any> = {
    domain,
    aRecords: [],
    aaaaRecords: [],
    cnameRecords: [],
  };

  try {
    try {
      if (options?.signal?.aborted) throw new Error('The operation was aborted');
      evidence.aRecords = await dns.resolve4(domain);
    } catch (err: any) {
      if (options?.signal?.aborted || err.message === 'The operation was aborted') throw err;
      // No IPv4 records
    }

    try {
      if (options?.signal?.aborted) throw new Error('The operation was aborted');
      evidence.aaaaRecords = await dns.resolve6(domain);
    } catch (err: any) {
      if (options?.signal?.aborted || err.message === 'The operation was aborted') throw err;
      // No IPv6 records
    }

    try {
      if (options?.signal?.aborted) throw new Error('The operation was aborted');
      evidence.cnameRecords = await dns.resolveCname(domain);
    } catch (err: any) {
      if (options?.signal?.aborted || err.message === 'The operation was aborted') throw err;
      // Not a CNAME
    }

    try {
      if (options?.signal?.aborted) throw new Error('The operation was aborted');
      evidence.nsRecords = await dns.resolveNs(domain);
    } catch (err: any) {
      if (options?.signal?.aborted || err.message === 'The operation was aborted') throw err;
      evidence.nsRecords = [];
    }

    if (options?.signal?.aborted) {
      throw new Error('The operation was aborted');
    }

    const hasIp = evidence.aRecords.length > 0 || evidence.aaaaRecords.length > 0;
    if (!hasIp) {
      findings.push({
        ruleId: 'DNS-NO-RECORDS',
        customDescription: `Domain "${domain}" does not resolve to any active A or AAAA address records.`,
        customEvidence: { domain },
      });
    } else if (evidence.nsRecords && evidence.nsRecords.length < 2 && evidence.nsRecords.length > 0) {
      findings.push({
        ruleId: 'DNS-NO-REDUNDANT-NS',
        customDescription: `Domain "${domain}" has only ${evidence.nsRecords.length} authoritative nameserver configured (${evidence.nsRecords.join(', ')}). At least 2 are recommended by RFC 1034 for redundancy.`,
        customEvidence: { nsCount: evidence.nsRecords.length, nsRecords: evidence.nsRecords },
      });
    }

    const status = findings.some((f) => f.ruleId === 'DNS-NO-RECORDS')
      ? 'FAIL'
      : findings.length > 0
        ? 'WARN'
        : 'PASS';

    return {
      module: 'DNS',
      status,
      executionTimeMs: Date.now() - startTime,
      evidence,
      findings,
    };
  } catch (err: any) {
    if (options?.signal?.aborted || err.message === 'The operation was aborted') {
      throw err;
    }
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

export class DnsCheck implements IScannerCheck {
  readonly meta: ScannerCheckMeta = {
    id: 'dns',
    category: 'DNS',
    name: 'DNS Resolution & Host Routing',
    description: 'Checks A, AAAA, and CNAME address mapping for reachable host routing.',
    timeoutMs: 10000,
  };

  async execute(context: CheckExecutionContext): Promise<CheckModuleExecutionResult> {
    return runDnsCheck(context.target.hostname, { signal: context.signal });
  }
}

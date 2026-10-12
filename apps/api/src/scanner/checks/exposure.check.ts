import { CheckModuleExecutionResult } from '@wsc/shared';
import { safeFetch } from '../network/pinned.agent.js';

export async function runExposureCheck(domain: string): Promise<CheckModuleExecutionResult> {
  const startTime = Date.now();
  const findings: Array<{ ruleId: string; customDescription?: string; customEvidence?: Record<string, any> }> = [];

  try {
    const res = await safeFetch(`https://${domain}`, { method: 'HEAD', maxRedirects: 2 });
    const headers = res.headers;

    const evidence: Record<string, any> = {
      serverHeader: headers['server'] || null,
      xPoweredBy: headers['x-powered-by'] || null,
    };

    // 1. Server Header Disclosure
    const serverVal = headers['server'];
    if (serverVal && typeof serverVal === 'string') {
      // Check if it reveals specific version numbers or verbose banner
      const hasVersion = /\d+\.\d+/.test(serverVal);
      if (hasVersion || serverVal.length > 15) {
        findings.push({
          ruleId: 'EXP-SERVER-HEADER',
          customDescription: `The Server response header discloses specific software/version: "${serverVal}".`,
          customEvidence: { server: serverVal },
        });
      }
    }

    // 2. X-Powered-By Disclosure
    const poweredBy = headers['x-powered-by'];
    if (poweredBy) {
      const poweredByStr = Array.isArray(poweredBy) ? poweredBy.join(', ') : poweredBy;
      findings.push({
        ruleId: 'EXP-X-POWERED-BY',
        customDescription: `The application reveals its underlying software platform via X-Powered-By: "${poweredByStr}".`,
        customEvidence: { xPoweredBy: poweredByStr },
      });
    }

    const status = findings.length > 0 ? 'INFO' : 'PASS';

    return {
      module: 'EXPOSURE',
      status,
      executionTimeMs: Date.now() - startTime,
      evidence,
      findings,
    };
  } catch (err: any) {
    return {
      module: 'EXPOSURE',
      status: 'INFO',
      executionTimeMs: Date.now() - startTime,
      evidence: { error: err.message },
      findings: [],
    };
  }
}

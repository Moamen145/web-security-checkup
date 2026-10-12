import { CheckModuleExecutionResult, ScannerCheckMeta } from '@wsc/shared';
import { safeFetch } from '../network/pinned.agent.js';
import { IScannerCheck, CheckExecutionContext } from '../engine/check.interface.js';

export async function runExposureCheck(
  domain: string,
  options?: { signal?: AbortSignal }
): Promise<CheckModuleExecutionResult> {
  const startTime = Date.now();
  if (options?.signal?.aborted) {
    throw new Error('The operation was aborted');
  }

  const findings: Array<{ ruleId: string; customDescription?: string; customEvidence?: Record<string, any> }> = [];

  try {
    const res = await safeFetch(`https://${domain}`, {
      method: 'HEAD',
      maxRedirects: 2,
      signal: options?.signal,
    });
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

    // 3. security.txt discovery (RFC 9116)
    try {
      if (options?.signal?.aborted) throw new Error('The operation was aborted');
      const secTxtRes = await safeFetch(`https://${domain}/.well-known/security.txt`, {
        method: 'GET',
        maxRedirects: 2,
        timeoutMs: 3000,
        signal: options?.signal,
      });
      if (secTxtRes.statusCode === 200 && /contact:/i.test(secTxtRes.body)) {
        evidence.securityTxtPresent = true;
      } else {
        evidence.securityTxtPresent = false;
        findings.push({
          ruleId: 'EXP-MISSING-SECURITY-TXT',
          customDescription: 'No valid security.txt vulnerability disclosure policy found at /.well-known/security.txt.',
          customEvidence: { checkedUrl: `https://${domain}/.well-known/security.txt`, statusCode: secTxtRes.statusCode },
        });
      }
    } catch (err: any) {
      if (options?.signal?.aborted || err.message === 'The operation was aborted') throw err;
      evidence.securityTxtPresent = false;
      findings.push({
        ruleId: 'EXP-MISSING-SECURITY-TXT',
        customDescription: 'No valid security.txt vulnerability disclosure policy found at /.well-known/security.txt.',
        customEvidence: { error: err.message },
      });
    }

    // 4. robots.txt sensitive path disclosure
    try {
      if (options?.signal?.aborted) throw new Error('The operation was aborted');
      const robotsRes = await safeFetch(`https://${domain}/robots.txt`, {
        method: 'GET',
        maxRedirects: 2,
        timeoutMs: 3000,
        signal: options?.signal,
      });
      if (robotsRes.statusCode === 200 && robotsRes.body) {
        const sensitiveRegex = /disallow:\s*(\/(admin|backup|config|\.git|secret|private|database|dump|api-keys)[^\r\n]*)/gi;
        const matches: string[] = [];
        let match;
        while ((match = sensitiveRegex.exec(robotsRes.body)) !== null) {
          matches.push(match[1]);
        }
        if (matches.length > 0) {
          findings.push({
            ruleId: 'EXP-ROBOTS-SENSITIVE-PATHS',
            customDescription: `robots.txt reveals ${matches.length} potentially sensitive administrative or backup path(s): ${matches.slice(0, 3).join(', ')}.`,
            customEvidence: { disallowedPaths: matches },
          });
        }
      }
    } catch (err: any) {
      if (options?.signal?.aborted || err.message === 'The operation was aborted') throw err;
      // robots.txt unreachable, ignore
    }

    const status = findings.some((f) => f.ruleId === 'EXP-ROBOTS-SENSITIVE-PATHS')
      ? 'WARN'
      : findings.length > 0
        ? 'INFO'
        : 'PASS';

    return {
      module: 'EXPOSURE',
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
      module: 'EXPOSURE',
      status: 'INFO',
      executionTimeMs: Date.now() - startTime,
      evidence: { error: err.message },
      findings: [],
    };
  }
}

export class ExposureCheck implements IScannerCheck {
  readonly meta: ScannerCheckMeta = {
    id: 'exposure',
    category: 'EXPOSURE',
    name: 'Technology & Header Exposure',
    description: 'Detects server banner and technology fingerprint leakage in response headers.',
    timeoutMs: 10000,
  };

  async execute(context: CheckExecutionContext): Promise<CheckModuleExecutionResult> {
    return runExposureCheck(context.target.hostname, { signal: context.signal });
  }
}

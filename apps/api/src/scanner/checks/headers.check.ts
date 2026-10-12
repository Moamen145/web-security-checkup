import { CheckModuleExecutionResult, ScannerCheckMeta } from '@wsc/shared';
import { safeFetch } from '../network/pinned.agent.js';
import { IScannerCheck, CheckExecutionContext } from '../engine/check.interface.js';

export function parseCspDirectives(cspHeader: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  const parts = cspHeader.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const directiveName = tokens[0].toLowerCase();
    const directiveValues = tokens.slice(1).map((v) => v.toLowerCase());
    directives.set(directiveName, directiveValues);
  }

  return directives;
}

export function evaluateCspHeader(csp: string): {
  findings: Array<{ ruleId: string; customDescription?: string; customEvidence?: Record<string, any> }>;
  hasFrameAncestors: boolean;
  directives: Record<string, string[]>;
} {
  const findings: Array<{ ruleId: string; customDescription?: string; customEvidence?: Record<string, any> }> = [];
  const parsed = parseCspDirectives(csp);
  const directivesObj: Record<string, string[]> = {};
  for (const [k, v] of parsed.entries()) {
    directivesObj[k] = v;
  }

  const scriptTokens = parsed.get('script-src');
  const defaultTokens = parsed.get('default-src');

  let hasUnsafeInline = false;
  let hasWildcardScript = false;
  let evaluatedDirective = '';

  // script-src takes precedence; default-src serves as fallback only if script-src is not defined
  if (scriptTokens) {
    evaluatedDirective = 'script-src';
    if (scriptTokens.includes("'unsafe-inline'")) {
      hasUnsafeInline = true;
    }
    if (scriptTokens.includes('*')) {
      hasWildcardScript = true;
    }
  } else if (defaultTokens) {
    evaluatedDirective = 'default-src';
    if (defaultTokens.includes("'unsafe-inline'")) {
      hasUnsafeInline = true;
    }
    if (defaultTokens.includes('*')) {
      hasWildcardScript = true;
    }
  }

  if (hasUnsafeInline || hasWildcardScript) {
    const reasons = [
      hasUnsafeInline ? "'unsafe-inline'" : '',
      hasWildcardScript ? 'wildcard (*)' : '',
    ].filter(Boolean);

    findings.push({
      ruleId: 'HDR-INSECURE-CSP',
      customDescription: `The Content-Security-Policy allows permissive script execution via ${evaluatedDirective} (${reasons.join(', ')}).`,
      customEvidence: {
        rawCsp: csp,
        evaluatedDirective,
        hasUnsafeInline,
        hasWildcardScript,
      },
    });
  }

  const hasFrameAncestors = parsed.has('frame-ancestors');

  return { findings, hasFrameAncestors, directives: directivesObj };
}

export async function runHeadersCheck(
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
      method: 'GET',
      maxRedirects: 3,
      signal: options?.signal,
    });
    const headers = res.headers;

    // Normalize header keys to lowercase
    const normalizedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === 'string') {
        normalizedHeaders[k.toLowerCase()] = v;
      } else if (Array.isArray(v)) {
        normalizedHeaders[k.toLowerCase()] = v.join(', ');
      }
    }

    const evidence: Record<string, any> = {
      finalUrl: res.finalUrl,
      observedHeaders: normalizedHeaders,
    };

    // 1. Strict-Transport-Security (HSTS)
    const hsts = normalizedHeaders['strict-transport-security'];
    if (!hsts) {
      findings.push({
        ruleId: 'HDR-MISSING-HSTS',
        customEvidence: { headerPresent: false },
      });
    } else {
      evidence.hstsValue = hsts;
      const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
      const maxAgeSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
      if (maxAgeSeconds < 15552000) {
        // Less than 180 days
        findings.push({
          ruleId: 'HDR-WEAK-HSTS',
          customDescription: `HSTS max-age is set to ${maxAgeSeconds} seconds, which is less than the recommended 180 days (15552000 seconds).`,
          customEvidence: { rawHsts: hsts, maxAgeSeconds },
        });
      }
    }

    // 2. Content-Security-Policy (CSP)
    const csp = normalizedHeaders['content-security-policy'];
    let hasFrameAncestors = false;
    if (!csp) {
      findings.push({
        ruleId: 'HDR-MISSING-CSP',
        customEvidence: { headerPresent: false },
      });
    } else {
      evidence.cspValue = csp;
      const cspEval = evaluateCspHeader(csp);
      findings.push(...cspEval.findings);
      hasFrameAncestors = cspEval.hasFrameAncestors;
      evidence.cspDirectives = cspEval.directives;
    }

    // 3. X-Frame-Options / frame-ancestors
    const xfo = normalizedHeaders['x-frame-options'];
    if (!xfo && !hasFrameAncestors) {
      findings.push({
        ruleId: 'HDR-MISSING-X-FRAME-OPTIONS',
        customEvidence: { xfoPresent: false, hasFrameAncestors: false },
      });
    } else {
      evidence.xFrameOptions = xfo || 'handled_by_csp_frame_ancestors';
    }

    // 4. X-Content-Type-Options
    const xcto = normalizedHeaders['x-content-type-options'];
    if (!xcto || !xcto.toLowerCase().includes('nosniff')) {
      findings.push({
        ruleId: 'HDR-MISSING-X-CONTENT-TYPE-OPTIONS',
        customEvidence: { headerValue: xcto || null },
      });
    } else {
      evidence.xContentTypeOptions = xcto;
    }

    // 5. Referrer-Policy
    const refPolicy = normalizedHeaders['referrer-policy'];
    if (!refPolicy) {
      findings.push({
        ruleId: 'HDR-MISSING-REFERRER-POLICY',
        customEvidence: { headerPresent: false },
      });
    } else {
      evidence.referrerPolicy = refPolicy;
    }

    // 6. Permissions-Policy
    const permPolicy = normalizedHeaders['permissions-policy'];
    if (!permPolicy) {
      findings.push({
        ruleId: 'HDR-MISSING-PERMISSIONS-POLICY',
        customEvidence: { headerPresent: false },
      });
    } else {
      evidence.permissionsPolicy = permPolicy;
    }

    const status = findings.length === 0 ? 'PASS' : findings.some((f) => f.ruleId === 'HDR-MISSING-HSTS') ? 'WARN' : 'WARN';

    return {
      module: 'SECURITY_HEADERS',
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
      module: 'SECURITY_HEADERS',
      status: 'ERROR',
      executionTimeMs: Date.now() - startTime,
      evidence: {
        error: err.message,
        unavailable: true,
        reason: 'Target cannot be reached over HTTPS',
      },
      findings: [],
      error: err.message,
    };
  }
}

export class HeadersCheck implements IScannerCheck {
  readonly meta: ScannerCheckMeta = {
    id: 'headers',
    category: 'SECURITY_HEADERS',
    name: 'HTTP Security Headers',
    description: 'Evaluates defense-in-depth HTTP response headers (CSP, HSTS, XFO, etc.).',
    timeoutMs: 10000,
  };

  async execute(context: CheckExecutionContext): Promise<CheckModuleExecutionResult> {
    return runHeadersCheck(context.target.hostname, { signal: context.signal });
  }
}

import { CheckModuleExecutionResult, ScannerCheckMeta } from '@wsc/shared';
import { safeFetch } from '../network/pinned.agent.js';
import { IScannerCheck, CheckExecutionContext } from '../engine/check.interface.js';

interface ParsedCookie {
  name: string;
  value: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  raw: string;
}

export async function runCookiesCheck(
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
    const setCookieHeaders = res.headers['set-cookie'];

    const cookieStrings: string[] = [];
    if (typeof setCookieHeaders === 'string') {
      cookieStrings.push(setCookieHeaders);
    } else if (Array.isArray(setCookieHeaders)) {
      cookieStrings.push(...setCookieHeaders);
    }

    const parsedCookies: ParsedCookie[] = cookieStrings.map(parseCookieHeader);
    const evidence: Record<string, any> = {
      cookieCount: parsedCookies.length,
      cookies: parsedCookies.map((c) => ({
        name: c.name,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
      })),
    };

    if (parsedCookies.length === 0) {
      // No cookies set on landing page - good defensive baseline
      return {
        module: 'COOKIES',
        status: 'PASS',
        executionTimeMs: Date.now() - startTime,
        evidence: { ...evidence, note: 'No cookies set on base URL response.' },
        findings: [],
      };
    }

    // Check for cookies missing Secure flag
    const insecureCookies = parsedCookies.filter((c) => !c.secure);
    if (insecureCookies.length > 0) {
      findings.push({
        ruleId: 'CK-MISSING-SECURE',
        customDescription: `Detected ${insecureCookies.length} cookie(s) missing the Secure flag: ${insecureCookies.map((c) => c.name).join(', ')}.`,
        customEvidence: { insecureCookies: insecureCookies.map((c) => c.name) },
      });
    }

    // Check for cookies missing HttpOnly flag
    const nonHttpOnlyCookies = parsedCookies.filter((c) => !c.httpOnly);
    if (nonHttpOnlyCookies.length > 0) {
      findings.push({
        ruleId: 'CK-MISSING-HTTPONLY',
        customDescription: `Detected ${nonHttpOnlyCookies.length} cookie(s) without HttpOnly protection: ${nonHttpOnlyCookies.map((c) => c.name).join(', ')}.`,
        customEvidence: { nonHttpOnlyCookies: nonHttpOnlyCookies.map((c) => c.name) },
      });
    }

    // Check for cookies missing SameSite attribute
    const missingSameSiteCookies = parsedCookies.filter((c) => !c.sameSite);
    if (missingSameSiteCookies.length > 0) {
      findings.push({
        ruleId: 'CK-MISSING-SAMESITE',
        customDescription: `Detected ${missingSameSiteCookies.length} cookie(s) without an explicit SameSite attribute: ${missingSameSiteCookies.map((c) => c.name).join(', ')}.`,
        customEvidence: { missingSameSiteCookies: missingSameSiteCookies.map((c) => c.name) },
      });
    }

    // Check for sensitive cookies missing __Host- prefix
    const sessionCookieRegex = /sess|auth|token|jwt|sid|login/i;
    const sessionCookiesWithoutHostPrefix = parsedCookies.filter(
      (c) => sessionCookieRegex.test(c.name) && !c.name.startsWith('__Host-')
    );
    if (sessionCookiesWithoutHostPrefix.length > 0) {
      findings.push({
        ruleId: 'CK-MISSING-HOST-PREFIX',
        customDescription: `Identified session/auth cookie(s) lacking protective __Host- prefix: ${sessionCookiesWithoutHostPrefix.map((c) => c.name).join(', ')}.`,
        customEvidence: { cookiesWithoutHostPrefix: sessionCookiesWithoutHostPrefix.map((c) => c.name) },
      });
    }

    const status = findings.length === 0 ? 'PASS' : findings.some((f) => f.ruleId === 'CK-MISSING-SECURE') ? 'WARN' : 'INFO';

    return {
      module: 'COOKIES',
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
      module: 'COOKIES',
      status: 'INFO',
      executionTimeMs: Date.now() - startTime,
      evidence: { error: err.message },
      findings: [],
    };
  }
}


function parseCookieHeader(raw: string): ParsedCookie {
  const parts = raw.split(';').map((p) => p.trim());
  const [nameValue, ...attributes] = parts;
  const eqIdx = nameValue.indexOf('=');
  const name = eqIdx > -1 ? nameValue.slice(0, eqIdx) : nameValue;
  const value = eqIdx > -1 ? nameValue.slice(eqIdx + 1) : '';

  let secure = false;
  let httpOnly = false;
  let sameSite: 'Lax' | 'Strict' | 'None' | undefined = undefined;

  for (const attr of attributes) {
    const lower = attr.toLowerCase();
    if (lower === 'secure') {
      secure = true;
    } else if (lower === 'httponly') {
      httpOnly = true;
    } else if (lower.startsWith('samesite=')) {
      const val = lower.slice('samesite='.length);
      if (val === 'lax') sameSite = 'Lax';
      else if (val === 'strict') sameSite = 'Strict';
      else if (val === 'none') sameSite = 'None';
    }
  }

  return { name, value, secure, httpOnly, sameSite, raw };
}

export class CookiesCheck implements IScannerCheck {
  readonly meta: ScannerCheckMeta = {
    id: 'cookies',
    category: 'COOKIES',
    name: 'Cookie Security Attributes',
    description: 'Inspects HTTP cookies for Secure, HttpOnly, and SameSite attributes.',
    timeoutMs: 10000,
  };

  async execute(context: CheckExecutionContext): Promise<CheckModuleExecutionResult> {
    return runCookiesCheck(context.target.hostname, { signal: context.signal });
  }
}

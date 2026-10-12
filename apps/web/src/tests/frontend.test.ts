import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain } from '@wsc/shared';
import { extractCooldownSeconds } from '../services/api.js';

describe('Frontend Logic & UX Rules', () => {
  describe('Domain Normalization & Input Sanitization', () => {
    it('strips https protocol, path, and query parameters', () => {
      const input = 'https://example.com/login?ref=1';
      const normalized = normalizeDomain(input);
      assert.equal(normalized, 'example.com');
    });

    it('strips http protocol and trailing slashes', () => {
      const input = 'http://api.staging.internal-site.org///';
      const normalized = normalizeDomain(input);
      assert.equal(normalized, 'api.staging.internal-site.org');
    });

    it('lowercases mixed-case domain inputs', () => {
      const input = 'MySecureWebsite.COM';
      const normalized = normalizeDomain(input);
      assert.equal(normalized, 'mysecurewebsite.com');
    });

    it('handles clean domains directly', () => {
      const input = 'github.com';
      const normalized = normalizeDomain(input);
      assert.equal(normalized, 'github.com');
    });
  });

  describe('Cooldown Extraction & Rate Limiting (HTTP 429)', () => {
    it('extracts cooldown seconds from standard API error message', () => {
      const message = 'Target scan cooldown active for example.com. Please wait 48 seconds before requesting another scan.';
      const seconds = extractCooldownSeconds(message);
      assert.equal(seconds, 48);
    });

    it('extracts cooldown seconds from single second remaining message', () => {
      const message = 'Target scan cooldown active. Please wait 1 second before requesting another scan.';
      const seconds = extractCooldownSeconds(message);
      assert.equal(seconds, 1);
    });

    it('returns null for non-cooldown messages', () => {
      assert.equal(extractCooldownSeconds('Domain is not reachable via public DNS'), null);
      assert.equal(extractCooldownSeconds('Authentication required'), null);
      assert.equal(extractCooldownSeconds(''), null);
      assert.equal(extractCooldownSeconds(null), null);
    });
  });

  describe('Route Pattern Matching & Deep Linking', () => {
    function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
      const patternSegments = pattern.split('/').filter(Boolean);
      const pathSegments = pathname.split('/').filter(Boolean);

      if (patternSegments.length !== pathSegments.length) {
        return null;
      }

      const params: Record<string, string> = {};
      for (let i = 0; i < patternSegments.length; i++) {
        const pSeg = patternSegments[i];
        const aSeg = pathSegments[i];

        if (pSeg.startsWith(':')) {
          const paramName = pSeg.slice(1);
          params[paramName] = decodeURIComponent(aSeg);
        } else if (pSeg !== aSeg) {
          return null;
        }
      }

      return params;
    }

    it('matches root route /', () => {
      const match = matchRoute('/', '/');
      assert.deepEqual(match, {});
    });

    it('matches /assessment/:id and decodes param', () => {
      const match = matchRoute('/assessment/:id', '/assessment/cm-test-uuid-999');
      assert.deepEqual(match, { id: 'cm-test-uuid-999' });
    });

    it('matches /target/:id/history and decodes param', () => {
      const match = matchRoute('/target/:id/history', '/target/target-42/history');
      assert.deepEqual(match, { id: 'target-42' });
    });

    it('rejects non-matching segments or extra slashes', () => {
      assert.equal(matchRoute('/assessment/:id', '/assessment/123/extra'), null);
      assert.equal(matchRoute('/compare', '/settings'), null);
      assert.equal(matchRoute('/dashboard', '/dashboard/extra'), null);
    });
  });

  describe('Category Scorecard Defense & Presentation Rules', () => {
    interface CategoryPresentation {
      badge: 'PASS' | 'WARN' | 'FAIL' | 'UNAVAILABLE';
      displayScore: string;
      isFactoredIntoGrade: boolean;
    }

    function evaluateCategoryPresentation(
      score: number | null,
      status?: 'PASS' | 'WARN' | 'FAIL' | 'ERROR' | 'UNAVAILABLE'
    ): CategoryPresentation {
      const isUnavailable = score === null || status === 'ERROR' || status === 'UNAVAILABLE';

      if (isUnavailable) {
        return {
          badge: 'UNAVAILABLE',
          displayScore: 'N/A',
          isFactoredIntoGrade: false,
        };
      }

      let badge: 'PASS' | 'WARN' | 'FAIL' = 'FAIL';
      if (score >= 80) badge = 'PASS';
      else if (score >= 60) badge = 'WARN';

      return {
        badge,
        displayScore: `${score}/100`,
        isFactoredIntoGrade: true,
      };
    }

    it('NEVER treats a failed/error check as 100% or PASS', () => {
      const result = evaluateCategoryPresentation(null, 'ERROR');
      assert.equal(result.badge, 'UNAVAILABLE');
      assert.equal(result.displayScore, 'N/A');
      assert.equal(result.isFactoredIntoGrade, false);
      assert.notEqual(result.badge, 'PASS');
    });

    it('properly presents PASS for category score >= 80', () => {
      const result = evaluateCategoryPresentation(95, 'PASS');
      assert.equal(result.badge, 'PASS');
      assert.equal(result.displayScore, '95/100');
      assert.equal(result.isFactoredIntoGrade, true);
    });

    it('properly presents WARN for category score between 60 and 79', () => {
      const result = evaluateCategoryPresentation(70, 'WARN');
      assert.equal(result.badge, 'WARN');
      assert.equal(result.displayScore, '70/100');
      assert.equal(result.isFactoredIntoGrade, true);
    });

    it('properly presents FAIL for category score < 60', () => {
      const result = evaluateCategoryPresentation(45, 'FAIL');
      assert.equal(result.badge, 'FAIL');
      assert.equal(result.displayScore, '45/100');
      assert.equal(result.isFactoredIntoGrade, true);
    });
  });

  describe('SSE Resilience & Authoritative State Handling', () => {
    it('resolves terminal status strictly from database authority', () => {
      let isCompleted = false;
      let isFailed = false;

      // Simulated state receiver
      function handleDbStatus(status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED') {
        if (status === 'COMPLETED') isCompleted = true;
        if (status === 'FAILED') isFailed = true;
      }

      // If SSE disconnects while scan is RUNNING, do not set isFailed
      const sseDropped = true;
      if (sseDropped) {
        // SSE error triggers DB check, not automatic scan failure
        const dbStatus = 'RUNNING';
        handleDbStatus(dbStatus);
      }
      assert.equal(isFailed, false);
      assert.equal(isCompleted, false);

      // When DB transitions to COMPLETED, UI transitions to complete
      handleDbStatus('COMPLETED');
      assert.equal(isCompleted, true);
      assert.equal(isFailed, false);
    });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CheckRegistry,
  createDefaultCheckRegistry,
} from '../scanner/engine/check.registry.js';
import { IScannerCheck, CheckExecutionContext } from '../scanner/engine/check.interface.js';
import { executeIsolatedCheck } from '../scanner/engine/check.supervisor.js';
import { ScannerEngine } from '../scanner/engine/scanner.runner.js';
import { CheckModuleExecutionResult } from '@wsc/shared';

describe('Scanner Engine Architecture', () => {
  describe('CheckRegistry', () => {
    it('should initialize default registry with all 6 standard security checks', () => {
      const registry = createDefaultCheckRegistry();
      assert.strictEqual(registry.count, 6);

      const expectedIds = ['tls', 'headers', 'cookies', 'dns', 'email', 'exposure'];
      for (const id of expectedIds) {
        assert.ok(registry.has(id), `Missing check with id "${id}"`);
        const check = registry.get(id);
        assert.ok(check);
        assert.ok(check.meta.id === id);
        assert.ok(check.meta.name);
        assert.ok(check.meta.category);
        assert.ok(typeof check.execute === 'function');
      }
    });

    it('should reject duplicate check IDs', () => {
      const registry = new CheckRegistry();
      const mockCheck: IScannerCheck = {
        meta: {
          id: 'mock-1',
          category: 'SECURITY_HEADERS',
          name: 'Mock Check',
          description: 'Testing registration',
        },
        execute: async () => ({
          module: 'SECURITY_HEADERS',
          status: 'PASS',
          executionTimeMs: 1,
          evidence: {},
          findings: [],
        }),
      };

      registry.register(mockCheck);
      assert.throws(
        () => registry.register(mockCheck),
        /Duplicate check ID registered: "mock-1"/
      );
    });

    it('should reject invalid metadata on registration', () => {
      const registry = new CheckRegistry();

      assert.throws(
        () =>
          registry.register({
            meta: { id: '', category: 'DNS', name: 'Test', description: '' },
            execute: async () => ({} as any),
          }),
        /Check must have a non-empty string "id"/
      );

      assert.throws(
        () =>
          registry.register({
            meta: { id: 'test', category: 'DNS', name: '   ', description: '' },
            execute: async () => ({} as any),
          }),
        /must have a non-empty string "name"/
      );

      assert.throws(
        () =>
          registry.register({
            meta: { id: 'test', category: '' as any, name: 'Valid Name', description: '' },
            execute: async () => ({} as any),
          }),
        /must specify a valid FindingCategory/
      );
    });

    it('should query checks by category accurately', () => {
      const registry = createDefaultCheckRegistry();
      const tlsChecks = registry.getByCategory('TLS_HTTPS');
      assert.strictEqual(tlsChecks.length, 1);
      assert.strictEqual(tlsChecks[0].meta.id, 'tls');

      const headerChecks = registry.getByCategory('SECURITY_HEADERS');
      assert.strictEqual(headerChecks.length, 1);
      assert.strictEqual(headerChecks[0].meta.id, 'headers');
    });
  });

  describe('Supervisor & Isolation (executeIsolatedCheck)', () => {
    const dummyContext: CheckExecutionContext = {
      assessmentId: 'test-assessment-id',
      domain: 'example.com',
      target: {
        hostname: 'example.com',
        resolvedIp: '93.184.216.34',
        allIps: ['93.184.216.34'],
      },
    };

    it('should execute a well-behaved check and return its result', async () => {
      const mockCheck: IScannerCheck = {
        meta: {
          id: 'test-pass',
          category: 'COOKIES',
          name: 'Pass Check',
          description: 'Always passes',
          timeoutMs: 1000,
        },
        execute: async () => ({
          module: 'COOKIES',
          status: 'PASS',
          executionTimeMs: 10,
          evidence: { verified: true },
          findings: [],
        }),
      };

      const result = await executeIsolatedCheck(mockCheck, dummyContext);
      assert.strictEqual(result.status, 'PASS');
      assert.strictEqual(result.module, 'COOKIES');
      assert.strictEqual(result.evidence.verified, true);
    });

    it('should isolate unhandled exceptions and return ERROR status without throwing', async () => {
      const explodingCheck: IScannerCheck = {
        meta: {
          id: 'test-exploding',
          category: 'SECURITY_HEADERS',
          name: 'Exploding Check',
          description: 'Throws an unhandled exception',
          timeoutMs: 1000,
        },
        execute: async () => {
          throw new Error('Fatal socket or memory corruption');
        },
      };

      const result = await executeIsolatedCheck(explodingCheck, dummyContext);
      assert.strictEqual(result.status, 'ERROR');
      assert.strictEqual(result.module, 'SECURITY_HEADERS');
      assert.strictEqual(result.error, 'Fatal socket or memory corruption');
      assert.strictEqual(result.findings.length, 0);
    });

    it('should isolate timeout and abort in-flight check operations', async () => {
      let abortedReceived = false;

      const hangingCheck: IScannerCheck = {
        meta: {
          id: 'test-hanging',
          category: 'TLS_HTTPS',
          name: 'Hanging TLS Probe',
          description: 'Hangs indefinitely until aborted',
          timeoutMs: 50, // fast timeout for test
        },
        execute: async (ctx) => {
          return new Promise((resolve, reject) => {
            if (ctx.signal) {
              ctx.signal.addEventListener('abort', () => {
                abortedReceived = true;
                reject(new Error('The operation was aborted'));
              });
            }
          });
        },
      };

      const result = await executeIsolatedCheck(hangingCheck, dummyContext);
      assert.strictEqual(result.status, 'ERROR');
      assert.strictEqual(result.module, 'TLS_HTTPS');
      assert.ok(result.error?.includes('timed out after 50ms'));
      assert.strictEqual(result.evidence.timeout, true);

      // Verify that the underlying check's AbortSignal was triggered
      assert.strictEqual(abortedReceived, true);
    });

    it('should respect parent cancellation signal', async () => {
      const parentController = new AbortController();

      const longCheck: IScannerCheck = {
        meta: {
          id: 'test-parent-abort',
          category: 'DNS',
          name: 'Long Check',
          description: 'Cancelled by parent signal',
          timeoutMs: 5000,
        },
        execute: async (ctx) => {
          return new Promise((resolve, reject) => {
            if (ctx.signal) {
              ctx.signal.addEventListener('abort', () => {
                reject(new Error('Parent aborted check'));
              });
            }
          });
        },
      };

      // Trigger parent abort almost immediately
      setTimeout(() => parentController.abort(), 20);

      const result = await executeIsolatedCheck(longCheck, {
        ...dummyContext,
        signal: parentController.signal,
      });

      assert.strictEqual(result.status, 'ERROR');
    });
  });

  describe('ScannerEngine Pipeline Resilience', () => {
    it('should execute checks sequentially and preserve pipeline continuity when one check errors', async () => {
      const customRegistry = new CheckRegistry();

      const executedStages: string[] = [];

      const checkA: IScannerCheck = {
        meta: {
          id: 'check-a',
          category: 'SECURITY_HEADERS',
          name: 'Check Alpha',
          description: 'First check',
        },
        execute: async () => {
          executedStages.push('A');
          return {
            module: 'SECURITY_HEADERS',
            status: 'PASS',
            executionTimeMs: 5,
            evidence: { a: 1 },
            findings: [],
          };
        },
      };

      const checkB: IScannerCheck = {
        meta: {
          id: 'check-b',
          category: 'COOKIES',
          name: 'Check Beta (Failing)',
          description: 'Second check that explodes',
        },
        execute: async () => {
          executedStages.push('B');
          throw new Error('Check B crash!');
        },
      };

      const checkC: IScannerCheck = {
        meta: {
          id: 'check-c',
          category: 'DNS',
          name: 'Check Gamma',
          description: 'Third check that must still execute',
        },
        execute: async () => {
          executedStages.push('C');
          return {
            module: 'DNS',
            status: 'PASS',
            executionTimeMs: 5,
            evidence: { c: 3 },
            findings: [],
          };
        },
      };

      customRegistry.register(checkA).register(checkB).register(checkC);

      const engine = new ScannerEngine(customRegistry);

      const progressLogs: Array<{ stage: string; percent: number }> = [];

      // Run against example.com (which validateAndResolveTarget can resolve safely if internet is up or mocked)
      // Since ScannerEngine calls validateAndResolveTarget(domain), we can pass a public domain
      // Or in test, if ssrf allows example.com
      const scanResult = await engine.run(
        'mock-assessment-uuid',
        'example.com',
        (stage, percent) => {
          progressLogs.push({ stage, percent });
        }
      );

      // Verify all 3 checks ran despite check B throwing an exception
      assert.deepStrictEqual(executedStages, ['A', 'B', 'C']);
      assert.strictEqual(scanResult.checkResults.length, 3);

      const resultA = scanResult.checkResults.find((r) => r.checkModule === 'SECURITY_HEADERS');
      const resultB = scanResult.checkResults.find((r) => r.checkModule === 'COOKIES');
      const resultC = scanResult.checkResults.find((r) => r.checkModule === 'DNS');

      assert.strictEqual(resultA?.status, 'PASS');
      assert.strictEqual(resultB?.status, 'ERROR');
      assert.strictEqual(resultC?.status, 'PASS');

      // Check overall scoring computed without crash
      assert.ok(typeof scanResult.score === 'number');
      assert.ok(scanResult.grade);
      assert.strictEqual(scanResult.summary.totalChecks, 3);
      assert.strictEqual(scanResult.summary.passedChecks, 2);
      assert.strictEqual(scanResult.summary.failedChecks, 0); // ERROR is neither FAIL nor WARN
    });
  });
});

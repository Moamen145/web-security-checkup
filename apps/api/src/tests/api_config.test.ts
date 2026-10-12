import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveApiBaseUrl } from '@wsc/shared';

describe('BUG-01: Configurable Frontend API URL', () => {
  it('should use configured VITE_API_URL when provided', () => {
    const customUrl = 'https://api.websecuritycheckup.io/api/v1';
    const resolved = resolveApiBaseUrl({ VITE_API_URL: customUrl });
    assert.strictEqual(resolved, customUrl);
  });

  it('should trim and use configured VITE_API_URL when provided with whitespace', () => {
    const customUrl = '  https://custom-api.internal/api/v1  ';
    const resolved = resolveApiBaseUrl({ VITE_API_URL: customUrl });
    assert.strictEqual(resolved, 'https://custom-api.internal/api/v1');
  });

  it('should fallback to /api/v1 when VITE_API_URL is undefined or empty', () => {
    assert.strictEqual(resolveApiBaseUrl({ VITE_API_URL: '' }), '/api/v1');
    assert.strictEqual(resolveApiBaseUrl({ VITE_API_URL: '   ' }), '/api/v1');
    assert.strictEqual(resolveApiBaseUrl({}), '/api/v1');
    assert.strictEqual(resolveApiBaseUrl(undefined), '/api/v1');
  });
});

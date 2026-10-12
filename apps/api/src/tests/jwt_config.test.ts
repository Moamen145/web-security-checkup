import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateConfig, DEV_DEFAULT_JWT_SECRET } from '../config/env.js';

describe('SEC-02: JWT Secret Production Enforcement', () => {
  it('Production + missing JWT_SECRET should throw configuration error', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'production',
          JWT_SECRET: undefined,
        });
      },
      (err: any) => {
        assert.match(err.message, /Configuration error: JWT_SECRET must be explicitly provided in production/);
        return true;
      }
    );
  });

  it('Production + empty/whitespace JWT_SECRET should throw configuration error', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'production',
          JWT_SECRET: '   ',
        });
      },
      (err: any) => {
        assert.match(err.message, /Configuration error: JWT_SECRET must be explicitly provided in production/);
        return true;
      }
    );
  });

  it('Production + development fallback JWT_SECRET should throw configuration error', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'production',
          JWT_SECRET: DEV_DEFAULT_JWT_SECRET,
        });
      },
      (err: any) => {
        assert.match(err.message, /cannot use development fallback/);
        return true;
      }
    );
  });

  it('Production + valid explicit JWT_SECRET should configure successfully', () => {
    const customSecret = 'prod-strong-entropy-secret-key-9876543210';
    const config = validateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: customSecret,
    });

    assert.strictEqual(config.NODE_ENV, 'production');
    assert.strictEqual(config.JWT_SECRET, customSecret);
    assert.strictEqual(config.PORT, 4000);
  });

  it('Development behavior remains functional with fallback secret', () => {
    const config = validateConfig({
      NODE_ENV: 'development',
      JWT_SECRET: undefined,
    });

    assert.strictEqual(config.NODE_ENV, 'development');
    assert.strictEqual(config.JWT_SECRET, DEV_DEFAULT_JWT_SECRET);
  });
});

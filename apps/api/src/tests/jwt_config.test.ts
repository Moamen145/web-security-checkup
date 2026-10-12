import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateConfig, DEV_DEFAULT_JWT_SECRET, DEV_DEFAULT_DATABASE_URL } from '../config/env.js';

describe('SEC-02: JWT Secret Production Enforcement', () => {
  it('Production + missing JWT_SECRET should throw configuration error', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'production',
          JWT_SECRET: undefined,
          DATABASE_URL: 'postgresql://prod_user:secret@prod-db:5432/websecurity',
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
          DATABASE_URL: 'postgresql://prod_user:secret@prod-db:5432/websecurity',
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
          DATABASE_URL: 'postgresql://prod_user:secret@prod-db:5432/websecurity',
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
    const customDbUrl = 'postgresql://prod_user:secret@prod-db:5432/websecurity';
    const config = validateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: customSecret,
      DATABASE_URL: customDbUrl,
    });

    assert.strictEqual(config.NODE_ENV, 'production');
    assert.strictEqual(config.JWT_SECRET, customSecret);
    assert.strictEqual(config.DATABASE_URL, customDbUrl);
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

describe('ENV-01: Production DATABASE_URL Enforcement', () => {
  it('Production + missing DATABASE_URL should throw configuration error', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'prod-strong-entropy-secret-key-9876543210',
          DATABASE_URL: undefined,
        });
      },
      (err: any) => {
        assert.match(err.message, /Configuration error: DATABASE_URL must be explicitly provided in production/);
        return true;
      }
    );
  });

  it('Production + empty/whitespace DATABASE_URL should throw configuration error', () => {
    assert.throws(
      () => {
        validateConfig({
          NODE_ENV: 'production',
          JWT_SECRET: 'prod-strong-entropy-secret-key-9876543210',
          DATABASE_URL: '    ',
        });
      },
      (err: any) => {
        assert.match(err.message, /Configuration error: DATABASE_URL must be explicitly provided in production/);
        return true;
      }
    );
  });

  it('Production + valid explicit DATABASE_URL should configure successfully', () => {
    const customDbUrl = 'postgresql://app_user:prod_pass@pg.cluster.internal:5432/prod_db?schema=public';
    const config = validateConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'prod-strong-entropy-secret-key-9876543210',
      DATABASE_URL: customDbUrl,
    });

    assert.strictEqual(config.NODE_ENV, 'production');
    assert.strictEqual(config.DATABASE_URL, customDbUrl);
  });

  it('Development behavior retains fallback DATABASE_URL when omitted', () => {
    const config = validateConfig({
      NODE_ENV: 'development',
      DATABASE_URL: undefined,
    });

    assert.strictEqual(config.NODE_ENV, 'development');
    assert.strictEqual(config.DATABASE_URL, DEV_DEFAULT_DATABASE_URL);
  });
});

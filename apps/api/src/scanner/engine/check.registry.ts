import { FindingCategory } from '@wsc/shared';
import { IScannerCheck } from './check.interface.js';
import { TlsCheck } from '../checks/tls.check.js';
import { HeadersCheck } from '../checks/headers.check.js';
import { CookiesCheck } from '../checks/cookies.check.js';
import { DnsCheck } from '../checks/dns.check.js';
import { EmailSecurityCheck } from '../checks/email.check.js';
import { ExposureCheck } from '../checks/exposure.check.js';

export class CheckRegistry {
  private checks: Map<string, IScannerCheck> = new Map();

  register(check: IScannerCheck): this {
    if (!check) {
      throw new Error('Cannot register null or undefined check.');
    }
    const meta = check.meta;
    if (!meta || !meta.id || typeof meta.id !== 'string' || meta.id.trim() === '') {
      throw new Error('Check must have a non-empty string "id".');
    }
    if (!meta.name || typeof meta.name !== 'string' || meta.name.trim() === '') {
      throw new Error(`Check "${meta.id}" must have a non-empty string "name".`);
    }
    if (!meta.category) {
      throw new Error(`Check "${meta.id}" must specify a valid FindingCategory.`);
    }

    if (this.checks.has(meta.id)) {
      throw new Error(`Duplicate check ID registered: "${meta.id}".`);
    }

    this.checks.set(meta.id, check);
    return this;
  }

  get(id: string): IScannerCheck | undefined {
    return this.checks.get(id);
  }

  has(id: string): boolean {
    return this.checks.has(id);
  }

  getAll(): IScannerCheck[] {
    return Array.from(this.checks.values());
  }

  getByCategory(category: FindingCategory): IScannerCheck[] {
    return this.getAll().filter((c) => c.meta.category === category);
  }

  get count(): number {
    return this.checks.size;
  }

  clear(): void {
    this.checks.clear();
  }
}

/**
 * Creates and returns a freshly initialized registry populated with the 6 standard checks.
 */
export function createDefaultCheckRegistry(): CheckRegistry {
  const registry = new CheckRegistry();
  registry.register(new TlsCheck());
  registry.register(new HeadersCheck());
  registry.register(new CookiesCheck());
  registry.register(new DnsCheck());
  registry.register(new EmailSecurityCheck());
  registry.register(new ExposureCheck());
  return registry;
}

export const defaultCheckRegistry = createDefaultCheckRegistry();

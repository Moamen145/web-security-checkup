export const CATEGORIES = {
  TLS_HTTPS: 'TLS_HTTPS',
  SECURITY_HEADERS: 'SECURITY_HEADERS',
  COOKIES: 'COOKIES',
  DNS: 'DNS',
  EMAIL_SECURITY: 'EMAIL_SECURITY',
  EXPOSURE: 'EXPOSURE',
} as const;

export type FindingCategory = (typeof CATEGORIES)[keyof typeof CATEGORIES];

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  TLS_HTTPS: 'HTTPS & TLS Transport',
  SECURITY_HEADERS: 'HTTP Security Headers',
  COOKIES: 'Cookie Security Flags',
  DNS: 'DNS & Infrastructure',
  EMAIL_SECURITY: 'Email Authentication (SPF/DMARC)',
  EXPOSURE: 'Information Disclosure & Exposure',
};

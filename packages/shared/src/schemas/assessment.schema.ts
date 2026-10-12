import { z } from 'zod';

export function normalizeDomain(input: string): string {
  let cleaned = input.trim().toLowerCase();
  // Strip protocol if user pasted http:// or https://
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  // Strip trailing slashes and paths/query params
  cleaned = cleaned.split('/')[0];
  cleaned = cleaned.split('?')[0];
  cleaned = cleaned.split('#')[0];
  // Strip trailing dot if present
  cleaned = cleaned.replace(/\.$/, '');
  return cleaned;
}

export const FQDN_REGEX = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/;

export const createAssessmentSchema = z.object({
  domain: z
    .string()
    .min(3, 'Domain must be at least 3 characters')
    .max(253, 'Domain exceeds maximum length of 253 characters')
    .transform(normalizeDomain)
    .refine((val) => FQDN_REGEX.test(val), {
      message: 'Invalid domain format. Must be a valid fully-qualified domain name (e.g., example.com)',
    })
    .refine((val) => !val.endsWith('.local') && !val.endsWith('.internal') && !val.endsWith('.lan') && !val.endsWith('.test'), {
      message: 'Special-use and internal top-level domains are not permitted',
    })
    .refine((val) => !/^(\d{1,3}\.){3}\d{1,3}$/.test(val), {
      message: 'Direct IP addresses are not permitted. Please specify a domain name.',
    }),
  authorized: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm that you are authorized to assess this domain' }),
  }),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const compareAssessmentsSchema = z.object({
  baseId: z.string().uuid('Invalid base assessment ID'),
  compareId: z.string().uuid('Invalid compare assessment ID'),
});

export type CompareAssessmentsInput = z.infer<typeof compareAssessmentsSchema>;

export const SEVERITIES = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO',
} as const;

export type FindingSeverity = (typeof SEVERITIES)[keyof typeof SEVERITIES];

export const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  INFO: 5,
};

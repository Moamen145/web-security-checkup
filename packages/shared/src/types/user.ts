export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

export interface Target {
  id: string;
  userId: string;
  domain: string;
  normalizedHostname: string;
  isVerified: boolean;
  isFavorite: boolean;
  lastAssessedAt?: string | null;
  latestScore?: number | null;
  latestGrade?: string | null;
  assessmentCount: number;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

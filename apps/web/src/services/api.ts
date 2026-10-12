import {
  Assessment,
  AuthResponse,
  ComparisonResult,
  Finding,
  LoginInput,
  RegisterInput,
  ScanProgressEvent,
  Target,
  User,
  resolveApiBaseUrl,
} from '@wsc/shared';

export { resolveApiBaseUrl };
export const API_BASE = resolveApiBaseUrl();

function getStoredToken(): string | null {
  return localStorage.getItem('wsc_token');
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('wsc_token', token);
  } else {
    localStorage.removeItem('wsc_token');
  }
}

export function extractCooldownSeconds(errorMessage?: string | null): number | null {
  if (!errorMessage) return null;
  const match = errorMessage.match(/wait\s+(\d+)\s+second/i);
  return match ? parseInt(match[1], 10) : null;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.error || `Request failed with status ${res.status}`;
    const error: any = new Error(message);
    error.statusCode = res.status;
    error.status = res.status;
    throw error;
  }

  return res.json();
}

export const api = {
  // Auth
  register: (data: RegisterInput): Promise<AuthResponse> =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: LoginInput): Promise<AuthResponse> =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  logout: (): Promise<{ message: string }> =>
    request('/auth/logout', { method: 'POST' }),

  getMe: (): Promise<{ user: User }> =>
    request('/auth/me'),

  // Assessments
  createAssessment: (domain: string): Promise<{ assessmentId: string; targetId: string; status: string }> =>
    request('/assessments', {
      method: 'POST',
      body: JSON.stringify({ domain, authorized: true }),
    }),

  getAssessment: (id: string): Promise<Assessment> =>
    request(`/assessments/${id}`),

  getFindings: (id: string, params?: { severity?: string; category?: string }): Promise<{ findings: Finding[] }> => {
    const query = new URLSearchParams(params as any).toString();
    return request(`/assessments/${id}/findings${query ? `?${query}` : ''}`);
  },

  compareAssessments: (baseId: string, compareId: string): Promise<ComparisonResult> =>
    request(`/assessments/compare?baseId=${baseId}&compareId=${compareId}`),

  requestAiExplanation: (id: string): Promise<any> =>
    request(`/assessments/${id}/ai-explain`, { method: 'POST' }),

  // Targets
  getTargets: (): Promise<{ targets: Target[] }> =>
    request('/targets'),

  getTargetHistory: (targetId: string): Promise<{ target: Target; history: any[] }> =>
    request(`/targets/${targetId}/history`),

  deleteTarget: (targetId: string): Promise<{ message: string }> =>
    request(`/targets/${targetId}`, { method: 'DELETE' }),

  // SSE Stream
  subscribeToScanStream: (
    assessmentId: string,
    onProgress: (event: ScanProgressEvent) => void,
    onError?: (err: any) => void
  ) => {
    const url = `${API_BASE}/assessments/${assessmentId}/stream`;

    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.addEventListener('progress', (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onProgress(parsed);
      } catch (err) {
        console.error('SSE JSON parse error:', err);
      }
    });

    eventSource.onerror = (err) => {
      eventSource.close();
      onError?.(err);
    };

    return () => {
      eventSource.close();
    };
  },
};

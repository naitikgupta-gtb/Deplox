/**
 * Thin fetch wrapper around the DEPLOX API.
 *
 * Uses same-origin via Vite's dev proxy (see vite.config.ts).
 * All requests send credentials so the session cookie flows through.
 */

import type {
  CreateDeploymentInput,
  CreateProjectInput,
  Deployment,
  EnvVar,
  Project,
  SetEnvVarsInput,
  User,
} from '@deplox/shared-types';

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: { code?: string; message?: string } = {};
    try {
      body = (await res.json()) as { code?: string; message?: string };
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body.code ?? 'unknown', body.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export interface WebhookInfo {
  readonly url: string;
  readonly secret: string;
  readonly contentType: string;
  readonly events: ReadonlyArray<string>;
}

export interface UpdateProjectInput {
  readonly autoDeploy?: boolean;
  readonly customDomain?: string | null;
}

export const api = {
  me: () => request<User>('/api/me'),
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (input: CreateProjectInput) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  updateProject: (id: string, input: UpdateProjectInput) =>
    request<Project>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  getWebhook: (projectId: string) =>
    request<WebhookInfo>(`/api/projects/${projectId}/webhook`),
  rotateWebhook: (projectId: string) =>
    request<WebhookInfo>(`/api/projects/${projectId}/webhook/rotate`, { method: 'POST' }),
  listDeployments: (projectId: string) =>
    request<Deployment[]>(`/api/projects/${projectId}/deployments`),
  createDeployment: (projectId: string, input: CreateDeploymentInput = {}) =>
    request<Deployment>(`/api/projects/${projectId}/deployments`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  stopDeployment: (deploymentId: string) =>
    request<{ ok: true }>(`/api/deployments/${deploymentId}/stop`, { method: 'POST' }),
  rollbackDeployment: (deploymentId: string, targetDeploymentId: string) =>
    request<{ newDeploymentId: string }>(`/api/deployments/${deploymentId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ targetDeploymentId }),
    }),
  listEnv: (projectId: string) => request<EnvVar[]>(`/api/projects/${projectId}/env`),
  setEnv: (projectId: string, input: SetEnvVarsInput) =>
    request<{ ok: true }>(`/api/projects/${projectId}/env`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteEnv: (projectId: string, key: string) =>
    request<void>(`/api/projects/${projectId}/env/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),
};

export async function fetchMe(): Promise<User | null> {
  try {
    return await api.me();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export { ApiError };
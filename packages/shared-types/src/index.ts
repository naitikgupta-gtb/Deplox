/**
 * DEPLOX shared types.
 *
 * End-to-end TypeScript interfaces that flow between api, web, and worker.
 * Nothing here should import runtime-only code (no Node, no DOM).
 */

// =============================================================================
// Framework detection
// =============================================================================

export const SUPPORTED_FRAMEWORKS = [
  'react',
  'nextjs',
  'node',
  'python',
  'go',
  'static',
] as const;

export type Framework = (typeof SUPPORTED_FRAMEWORKS)[number];

/** Returns true if the given string is a supported framework name. */
export function isFramework(value: string): value is Framework {
  return (SUPPORTED_FRAMEWORKS as readonly string[]).includes(value);
}

// =============================================================================
// Deployment lifecycle
// =============================================================================

export const DEPLOYMENT_STATUSES = [
  'queued',
  'cloning',
  'detecting',
  'building',
  'starting',
  'running',
  'failed',
  'stopped',
  'rolled-back',
] as const;

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export function isDeploymentStatus(value: string): value is DeploymentStatus {
  return (DEPLOYMENT_STATUSES as readonly string[]).includes(value);
}

// =============================================================================
// User / project / deployment records
// =============================================================================

export interface User {
  readonly id: string;
  readonly githubId: number;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly email: string | null;
  readonly createdAt: string; // ISO
  /** AES-256-GCM ciphertext; null when the user has not completed OAuth. */
  readonly githubAccessTokenEncrypted?: string | null;
}

/** Public-facing project (no env vars exposed). */
export interface Project {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly githubRepoFullName: string; // "owner/repo"
  readonly githubRepoUrl: string;
  readonly defaultBranch: string;
  readonly framework: Framework | null;
  readonly customDomain: string | null;
  /** Whether pushes to the default branch should trigger an automatic deploy. */
  readonly autoDeploy: boolean;
  /** Whether this project has a webhook secret configured (never expose the secret itself). */
  readonly webhookConfigured: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Internal project record — includes the encrypted GitHub token. */
export interface ProjectInternal extends Project {
  readonly githubAccessTokenEncrypted: string | null;
}

export interface Deployment {
  readonly id: string;
  readonly projectId: string;
  readonly commitSha: string;
  readonly commitMessage: string | null;
  readonly commitAuthor: string | null;
  readonly status: DeploymentStatus;
  readonly framework: Framework | null;
  readonly containerId: string | null;
  readonly hostPort: number | null;
  readonly publicUrl: string | null;
  readonly errorMessage: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

export interface EnvVar {
  readonly id: string;
  readonly projectId: string;
  readonly key: string;
  /** Present only in responses; never returned in list endpoints. */
  readonly value?: string;
  readonly isSecret: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// =============================================================================
// API request / response shapes
// =============================================================================

export interface ApiError {
  readonly error: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface CreateProjectInput {
  readonly githubRepoFullName: string; // "owner/repo"
  readonly name?: string;
  readonly customDomain?: string;
}

export interface CreateDeploymentInput {
  readonly commitSha?: string; // defaults to repo HEAD
}

export interface SetEnvVarsInput {
  readonly variables: ReadonlyArray<{
    readonly key: string;
    readonly value: string;
    readonly isSecret?: boolean;
  }>;
}

// =============================================================================
// Log streaming (SSE)
// =============================================================================

export type LogStreamEvent =
  | { readonly type: 'log'; readonly line: string; readonly ts: string }
  | { readonly type: 'status'; readonly status: DeploymentStatus; readonly ts: string }
  | { readonly type: 'error'; readonly message: string; readonly ts: string }
  | { readonly type: 'done'; readonly status: DeploymentStatus; readonly ts: string };

// =============================================================================
// Build / runtime job payloads (BullMQ)
// =============================================================================

export interface BuildJobPayload {
  readonly deploymentId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly githubRepoFullName: string;
  readonly commitSha: string;
  readonly githubAccessToken: string | null;
}

export interface RunJobPayload {
  readonly deploymentId: string;
  readonly projectId: string;
  readonly hostPort: number;
  readonly framework: Framework;
  readonly imageTag: string;
  /** Decrypted env vars (already redacted for logs). */
  readonly envVars: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

export interface StopJobPayload {
  readonly deploymentId: string;
}

export interface RollbackJobPayload {
  readonly deploymentId: string; // current (broken) deployment
  readonly projectId: string;
  readonly targetDeploymentId: string; // previous working deployment to restore
}

// =============================================================================
// Docker provider abstraction (for mock vs real)
// =============================================================================

export interface BuildResult {
  readonly imageTag: string;
  readonly durationMs: number;
}

export interface RunResult {
  readonly containerId: string;
  readonly hostPort: number;
}

export interface LogChunk {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** Interface implemented by both the real Docker provider and the in-memory mock. */
export interface DockerProvider {
  build(opts: {
    readonly deploymentId: string;
    readonly sourceDir: string;
    readonly framework: Framework;
    readonly onLog?: (chunk: LogChunk) => void;
  }): Promise<BuildResult>;

  run(opts: {
    readonly deploymentId: string;
    readonly imageTag: string;
    readonly hostPort: number;
    readonly envVars: ReadonlyArray<{ readonly key: string; readonly value: string }>;
    readonly framework: Framework;
    readonly onLog?: (chunk: LogChunk) => void;
  }): Promise<RunResult>;

  stop(opts: { readonly containerId: string }): Promise<void>;

  logs(opts: { readonly containerId: string; readonly tail?: number }): Promise<string>;
}
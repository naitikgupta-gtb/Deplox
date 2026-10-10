/**
 * GitHub integration.
 *
 * Two responsibilities:
 *   1. OAuth: exchange a code for an access token, fetch the user.
 *   2. Repo clone: shallow-clone a repo (public or with token) into a
 *      temporary working directory using the `git` CLI.
 *
 * We use the system `git` CLI rather than the GitHub API tarball because:
 *   - it honours private repos with the access token
 *   - it preserves `.git/` so we can inspect commit metadata
 *   - it works offline once the clone is cached
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Octokit } from 'octokit';
import { childLogger } from '@deplox/shared-logger';

const execFile = promisify(execFileCb);
const log = childLogger({ component: 'github' });

// =============================================================================
// OAuth helpers
// =============================================================================

export interface GithubUserProfile {
  readonly githubId: number;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly email: string | null;
  readonly accessToken: string;
}

/**
 * Exchanges an OAuth code for a token + user profile by talking to GitHub
 * directly (avoids the Octokit v4 auth-helper mismatch with @octokit/auth-oauth-app).
 */
export async function exchangeOAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
  callbackUrl: string,
): Promise<GithubUserProfile> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as
    | { access_token: string; scope?: string; token_type?: string }
    | { error: string; error_description?: string };
  if ('error' in tokenJson) {
    throw new Error(`GitHub OAuth error: ${tokenJson.error} ${tokenJson.error_description ?? ''}`);
  }
  const token = tokenJson.access_token;

  const userOctokit = new Octokit({ auth: token });
  const { data: user } = await userOctokit.rest.users.getAuthenticated();

  return {
    githubId: user.id,
    username: user.login,
    displayName: user.name ?? null,
    avatarUrl: user.avatar_url,
    email: user.email ?? null,
    accessToken: token,
  };
}

// =============================================================================
// Repo metadata + clone
// =============================================================================

export interface RepoMetadata {
  readonly defaultBranch: string;
  readonly latestCommitSha: string;
  readonly latestCommitMessage: string | null;
  readonly latestCommitAuthor: string | null;
}

/** Returns default branch + HEAD commit info for a public/private repo. */
export async function fetchRepoMetadata(
  fullName: string,
  accessToken: string | null,
): Promise<RepoMetadata> {
  const octokit = new Octokit(accessToken ? { auth: accessToken } : {});
  const [owner, repo] = fullName.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repo full name: ${fullName}`);
  }

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const branch = repoData.default_branch;
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const sha = refData.object.sha;

  let message: string | null = null;
  let author: string | null = null;
  try {
    const { data: commit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: sha });
    message = commit.message.split('\n')[0] ?? null;
    author = commit.author?.name ?? commit.author?.email ?? null;
  } catch (err) {
    log.warn({ err, fullName }, 'failed to fetch HEAD commit message; continuing');
  }

  return {
    defaultBranch: branch,
    latestCommitSha: sha,
    latestCommitMessage: message,
    latestCommitAuthor: author,
  };
}

export interface CloneResult {
  readonly workdir: string;
  readonly commitSha: string;
  readonly commitMessage: string | null;
  readonly commitAuthor: string | null;
}

/**
 * Shallow-clones `fullName` (optionally pinned to `commitSha`) into a fresh
 * temp directory. Caller must clean up with `disposeClone()` when done.
 *
 * For private repos, pass the user's OAuth access token; we splice it into
 * the URL to keep `git` happy without persisting it in process state.
 */
export async function cloneRepo(
  fullName: string,
  commitSha: string | null,
  accessToken: string | null,
): Promise<CloneResult> {
  const workdir = await mkdtemp(join(tmpdir(), 'deplox-clone-'));
  const url = accessToken
    ? `https://x-access-token:${accessToken}@github.com/${fullName}.git`
    : `https://github.com/${fullName}.git`;

  log.info({ fullName, commitSha, workdir }, 'cloning repository');

  // Clone the repo's default branch with --depth 50 so we have recent history
  // (needed for `git checkout <sha>` of an arbitrary commit).
  await execFile(
    'git',
    ['clone', '--depth', '50', '--single-branch', '--', url, workdir],
    {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    },
  );

  // If a specific commit SHA was requested, fetch + checkout it. `--branch`
  // only accepts branch names, not SHAs, so this is a separate step.
  if (commitSha) {
    await execFile('git', ['fetch', '--depth', '50', 'origin', commitSha], {
      cwd: workdir,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    await execFile('git', ['checkout', commitSha], {
      cwd: workdir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  }

  // Resolve the actually-checked-out SHA (covers --branch cases).
  const { stdout: headOut } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: workdir });
  const { stdout: msgOut } = await execFile(
    'git',
    ['log', '-1', '--pretty=%s%n--DEPLOX--%an'],
    { cwd: workdir },
  );

  const [message, author] = msgOut.split('--DEPLOX--');

  return {
    workdir,
    commitSha: headOut.trim(),
    commitMessage: message?.trim() ?? null,
    commitAuthor: author?.trim() ?? null,
  };
}

/** Removes the cloned workdir. Safe to call multiple times. */
export async function disposeClone(workdir: string): Promise<void> {
  try {
    await rm(workdir, { recursive: true, force: true });
  } catch (err) {
    log.warn({ err, workdir }, 'failed to dispose clone workdir');
  }
}

// keep `readFile` exported for callers that want to inspect a file
export { readFile };

// =============================================================================
// List user repos (for the New Project picker UI)
// =============================================================================

export interface UserRepoSummary {
  /** "owner/name" — what we store on Project.githubRepoFullName. */
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
  readonly description: string | null;
  readonly stars: number;
  readonly language: string | null;
  /** ISO timestamp — used to sort "most recently pushed first". */
  readonly pushedAt: string;
  readonly htmlUrl: string;
}

/**
 * Lists the repos the authenticated user has access to on GitHub — used by
 * the New Project page so users can pick from a list instead of typing
 * `owner/repo` blind.
 *
 * Without a token we can't list anything (the GitHub `/user/repos` endpoint
 * requires authentication), so this returns `[]` and the front-end falls
 * back to a manual `owner/repo` input. With a token we hit the authenticated
 * endpoint and return up to 100 repos sorted by `pushed_at` desc.
 *
 * The `affiliation` param includes `owner` (repos the user owns),
 * `collaborator`, and `organization_member` so the picker also surfaces
 * org repos the user has access to.
 */
export async function listUserRepos(accessToken: string | null): Promise<UserRepoSummary[]> {
  if (!accessToken) return [];
  const octokit = new Octokit({ auth: accessToken });
  const repos: UserRepoSummary[] = [];
  for await (const { data } of octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, {
    affiliation: 'owner,collaborator,organization_member',
    per_page: 100,
    sort: 'pushed',
    direction: 'desc',
  })) {
    for (const r of data) {
      repos.push({
        fullName: r.full_name,
        defaultBranch: r.default_branch,
        isPrivate: r.private,
        description: r.description,
        stars: r.stargazers_count ?? 0,
        language: r.language,
        pushedAt: r.pushed_at ?? new Date(0).toISOString(),
        htmlUrl: r.html_url,
      });
    }
  }
  return repos;
}
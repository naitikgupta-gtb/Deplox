/**
 * Returns the active Docker provider — either the real Dockerode-backed one
 * or the in-memory mock used when DEPLOX_MOCK_DOCKER=1.
 *
 * Selection happens once at startup and is cached.
 */

import { loadConfig } from '@deplox/shared-config';
import type { DockerProvider } from '@deplox/shared-types';
import { RealDockerProvider } from './real.js';
import { MockDockerProvider } from './mock.js';

let cached: DockerProvider | null = null;

export function getDockerProvider(): DockerProvider {
  if (cached) return cached;
  const cfg = loadConfig();
  cached = cfg.DEPLOX_MOCK_DOCKER
    ? new MockDockerProvider()
    : new RealDockerProvider();
  return cached;
}

export type { DockerProvider } from '@deplox/shared-types';
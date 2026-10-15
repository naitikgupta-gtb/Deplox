/**
 * Fastify type augmentations for the deplox API.
 *
 * Some plugins (notably @fastify/rate-limit v9) declare their own
 * `FastifyContextConfig` interface, shadowing Fastify's default
 * index-signature type. This makes per-route `config: { rawBody: true }`
 * fail to typecheck because `rawBody` isn't a known property of the
 * shadowed interface.
 *
 * We re-declare `FastifyContextConfig` here with both plugin-known
 * fields AND our `rawBody` extension. Importing this file via a
 * `///<reference>` comment from a top-level module ensures the
 * augmentation is loaded.
 *
 * Per docs/SECURITY-AUDIT.md — keeps webhook + Razorpay routes
 * compilable while keeping rate-limit's type safety.
 */

import 'fastify';
import '@fastify/rate-limit';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * If true, the route handler receives the raw request body Buffer on
     * `req.rawBody` for HMAC verification (webhooks). Set per-route via
     * the `config: { rawBody: true }` option.
     */
    rawBody?: boolean;
  }
}

export {};

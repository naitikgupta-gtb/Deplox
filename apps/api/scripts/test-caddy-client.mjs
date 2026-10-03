#!/usr/bin/env node
/**
 * Exercises the caddy.ts client against a running mock-caddy.
 * Verifies:
 *   - pingCaddy returns true
 *   - registerDomainRoute posts the correct route by id
 *   - registerDomainRoute replaces an existing route (idempotent updates)
 *   - unregisterDomainRoute removes the route
 *   - unregisterDomainRoute on non-existent id is graceful
 */
import { pingCaddy, registerDomainRoute, unregisterDomainRoute } from '../src/services/caddy.ts';

console.log('1. ping caddy →', await pingCaddy());

console.log('\n2. register route example.com → localhost:9001');
const r1 = await registerDomainRoute('test-proj-1', 'example.com', 9001);
console.log('   result:', r1);

console.log('\n3. update route example.com → localhost:9002 (should replace)');
const r2 = await registerDomainRoute('test-proj-1', 'example.com', 9002);
console.log('   result:', r2);

console.log('\n4. verify mock-caddy stored the latest version');
const stored = await fetch('http://localhost:2019/_deplox_routes').then((r) => r.json());
console.log('   stored routes:', JSON.stringify(stored['deplox-domain-test-proj-1'], null, 2));

console.log('\n5. unregister route');
const r3 = await unregisterDomainRoute('test-proj-1');
console.log('   result:', r3);

console.log('\n6. unregister again (idempotent / graceful)');
const r4 = await unregisterDomainRoute('test-proj-1');
console.log('   result:', r4);

console.log('\nDone.');
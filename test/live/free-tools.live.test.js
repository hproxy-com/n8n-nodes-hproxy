'use strict';

/*
 * Live reads of HProxy's keyless endpoints through the compiled node, one each:
 * GET /api/proxy-list with a tight filter and GET /api/ip/8.8.8.8. They reach hproxy.com, so
 * they only run with HPROXY_LIVE=1. No API key is used and no keyed endpoint is called.
 *
 *   HPROXY_LIVE=1 npm run test:live                  (macOS, Linux, Git Bash)
 *   $env:HPROXY_LIVE = '1'; npm run test:live        (PowerShell)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RoutingHarness } = require('../helpers/routing-harness');

const harness = new RoutingHarness();
const live = process.env.HPROXY_LIVE === '1';

/** Sends the request the node built, exactly as built, and hands the answer back to the node. */
async function fetchTransport(request) {
	assert.equal(request.headers['X-API-Key'], undefined, 'a live test never sends a key');
	const response = await fetch(request.url, {
		method: request.method,
		headers: request.headers,
		body: request.body === undefined ? undefined : JSON.stringify(request.body),
		signal: AbortSignal.timeout(30000),
	});
	const text = await response.text();
	let body = text;
	try {
		body = JSON.parse(text);
	} catch {
		// a non-JSON answer stays text, and the node describes it
	}
	return { statusCode: response.status, headers: Object.fromEntries(response.headers), body };
}

describe(
	'live: HProxy keyless endpoints',
	{ skip: !live && 'set HPROXY_LIVE=1 to reach hproxy.com' },
	() => {
		it('Get Free Proxies returns at most 3 SOCKS5 proxies in Germany, simplified', async () => {
			const { requests, items, error } = await harness.run({
				parameters: {
					resource: 'freeTool',
					operation: 'getFreeProxies',
					limit: 3,
					filters: { country: 'DE', protocols: ['socks5'] },
				},
				transport: fetchTransport,
			});
			assert.equal(error, undefined, error && `${error.message}: ${error.description}`);
			assert.equal(requests[0].path, '/api/proxy-list');
			assert.deepEqual(requests[0].query, {
				format: 'json',
				limit: '3',
				country: 'DE',
				protocol: 'socks5',
			});
			assert.ok(items.length <= 3, `${items.length} items`);
			for (const { json } of items) {
				assert.equal(json.country_code, 'DE');
				assert.ok(json.protocols.includes('socks5'));
				assert.ok(Object.keys(json).length <= 10);
			}
		});

		it('Look Up IP places 8.8.8.8 in the US network of AS15169', async () => {
			const { requests, items, error } = await harness.run({
				parameters: { resource: 'freeTool', operation: 'lookUpIp', ip: '8.8.8.8' },
				transport: fetchTransport,
			});
			assert.equal(error, undefined, error && `${error.message}: ${error.description}`);
			assert.equal(requests[0].url, 'https://hproxy.com/api/ip/8.8.8.8');
			assert.equal(items.length, 1);
			assert.equal(items[0].json.ip, '8.8.8.8');
			assert.equal(items[0].json.country, 'US');
			assert.equal(items[0].json.asn, 15169);
		});
	},
);

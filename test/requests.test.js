'use strict';

/*
 * Every operation of the HProxy node, run through n8n's own parameter handling and expression
 * evaluator (test/helpers/routing-harness.js) against a recorder instead of the network:
 * method, URL, query, headers and body of each request, and the items made from each answer.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { NodeApiError, NodeOperationError } = require('n8n-workflow');
const { RoutingHarness } = require('./helpers/routing-harness');

const harness = new RoutingHarness();
const KEY = { apiKey: 'hpx_test_key_not_real' };
const PLAN_ID = 'cmjfmhhpd004c4i4hqsk3mzrr';
const plan = (value = PLAN_ID) => ({ __rl: true, mode: 'list', value });

/** A transport that records nothing itself and answers every request with the same response. */
const answer =
	(body, statusCode = 200, headers = {}) =>
	async () => ({ statusCode, headers, body });

/** Runs one item. `credentials: null` runs it with no credential selected. */
async function run(parameters, response = answer({}), credentials = KEY) {
	const result = await harness.run({
		parameters,
		credentials: credentials ?? undefined,
		transport: response,
	});
	return { ...result, request: result.requests[0] };
}

function assertKeyed(request) {
	assert.equal(request.headers['X-API-Key'], KEY.apiKey);
	assert.equal(request.headers.Accept, 'application/json');
	assert.equal(request.ignoreHttpStatusErrors, true);
}

describe('Proxy > Generate', () => {
	it('posts to the plan with the defaults and passes every line on unchanged, one item each', async () => {
		const lines = [
			'example.hproxy.com:10000:user-a:pass-a',
			'example.hproxy.com:10001:user-b:pass-b',
		];
		const { request, items, error } = await run(
			{ resource: 'proxy', operation: 'generate', planId: plan() },
			answer({ lines, productId: 'residential-premium' }),
		);
		assert.equal(error, undefined);
		assert.equal(request.method, 'POST');
		assert.equal(request.url, `https://hproxy.com/api/v1/plans/${PLAN_ID}/generate`);
		assertKeyed(request);
		// count and protocol carry their defaults; the empty country and the session type are not sent
		assert.deepEqual(request.body, { count: 1, protocol: 'http' });
		assert.deepEqual(
			items.map((item) => item.json),
			lines.map((line) => ({ line, productId: 'residential-premium', planId: PLAN_ID })),
		);
		assert.deepEqual(items[1].pairedItem, { item: 0 });
	});

	it('sends sticky sessions, country and every targeting field in the shape the API takes', async () => {
		const { request, error } = await run(
			{
				resource: 'proxy',
				operation: 'generate',
				planId: { __rl: true, mode: 'id', value: PLAN_ID },
				count: 25,
				protocol: 'socks5',
				sessionType: 'sticky',
				stickyMinutes: 45,
				country: '  US ',
				targeting: {
					city: 'New York',
					state: 'New York',
					excludeAsn: '7922, 7018',
					excludeCities: 'Houston,\nDallas',
					os: 'mac',
					strict: false,
					udp: true,
					asn: 0,
					isp: '',
				},
			},
			answer({ lines: [], productId: 'residential-premium' }),
		);
		assert.equal(error, undefined);
		assert.deepEqual(request.body, {
			count: 25,
			protocol: 'socks5',
			stickyMinutes: 45,
			country: 'US',
			city: 'New York',
			state: 'New York',
			excludeAsn: [7922, 7018],
			excludeCities: ['Houston', 'Dallas'],
			os: 'mac',
			strict: false,
			udp: true,
		});
	});

	it('sends an AS number and country exclusions as numbers and codes', async () => {
		const { request } = await run({
			resource: 'proxy',
			operation: 'generate',
			planId: plan(),
			targeting: { asn: 7922, excludeCountries: 'CN, RU' },
		});
		assert.equal(request.body.asn, 7922);
		assert.deepEqual(request.body.excludeCountries, ['CN', 'RU']);
	});

	it('takes the plan ID from an expression', async () => {
		const { request } = await harness
			.run({
				parameters: {
					resource: 'proxy',
					operation: 'generate',
					planId: { __rl: true, mode: 'id', value: '={{ $json.plan }}' },
				},
				credentials: KEY,
				input: { plan: 'cmexpressionplan01' },
				transport: answer({ lines: [] }),
			})
			.then((result) => ({ request: result.requests[0] }));
		assert.equal(request.path, '/api/v1/plans/cmexpressionplan01/generate');
	});

	it('stops before any request when the plan ID would change the URL', async () => {
		const { requests, error } = await run({
			resource: 'proxy',
			operation: 'generate',
			planId: { __rl: true, mode: 'id', value: '../wallet' },
		});
		assert.equal(requests.length, 0);
		assert.ok(error instanceof NodeOperationError);
		assert.equal(error.message, 'The "Plan" field needs a plan ID');
	});

	it('names the field when an exclusion list holds something other than AS numbers', async () => {
		const { requests, error } = await run({
			resource: 'proxy',
			operation: 'generate',
			planId: plan(),
			targeting: { excludeAsn: '7922, comcast' },
		});
		assert.equal(requests.length, 0);
		assert.ok(error instanceof NodeOperationError);
		assert.equal(error.message, 'The "Exclude Networks (ASN)" field needs AS numbers');
	});

	it('refuses more than 20 exclusions before the API does', async () => {
		const many = Array.from({ length: 21 }, (_, i) => `City ${i}`).join(',');
		const { requests, error } = await run({
			resource: 'proxy',
			operation: 'generate',
			planId: plan(),
			targeting: { excludeCities: many },
		});
		assert.equal(requests.length, 0);
		assert.match(error.message, /more than 20 entries/);
	});

	it('asks for an API key and sends nothing when no credential is selected', async () => {
		const { requests, error } = await run(
			{ resource: 'proxy', operation: 'generate', planId: plan() },
			answer({}),
			null,
		);
		assert.equal(requests.length, 0);
		assert.ok(error instanceof NodeOperationError);
		assert.equal(error.message, 'This operation needs an HProxy API key');
	});
});

describe('Plan', () => {
	const plans = Array.from({ length: 60 }, (_, i) => ({ id: `plan${i}`, status: 'active' }));

	it('Get Many reads the active plans and stops at the limit', async () => {
		const { request, items } = await run(
			{ resource: 'plan', operation: 'getAll' },
			answer({ plans }),
		);
		assert.equal(request.method, 'GET');
		assert.equal(request.url, 'https://hproxy.com/api/v1/plans?status=active');
		assertKeyed(request);
		assert.equal(request.body, undefined);
		assert.equal(items.length, 50);
		assert.deepEqual(items[0].json, { id: 'plan0', status: 'active' });
	});

	it('Get Many with Return All and status All returns every plan', async () => {
		const { request, items } = await run(
			{ resource: 'plan', operation: 'getAll', returnAll: true, status: 'all' },
			answer({ plans }),
		);
		assert.equal(request.url, 'https://hproxy.com/api/v1/plans?status=all');
		assert.equal(items.length, 60);
	});

	it('Get reads one plan', async () => {
		const body = { id: PLAN_ID, status: 'used_up', dataGbRemaining: 0 };
		const { request, items } = await run(
			{ resource: 'plan', operation: 'get', planId: plan() },
			answer(body),
		);
		assert.equal(request.method, 'GET');
		assert.equal(request.url, `https://hproxy.com/api/v1/plans/${PLAN_ID}`);
		assertKeyed(request);
		assert.deepEqual(
			items.map((item) => item.json),
			[body],
		);
	});

	it('Get Traffic reads the stats window, with the granularity only when chosen', async () => {
		const automatic = await run(
			{ resource: 'plan', operation: 'getTraffic', planId: plan() },
			answer({ points: [] }),
		);
		assert.equal(automatic.request.url, `https://hproxy.com/api/v1/plans/${PLAN_ID}/stats?days=7`);
		assertKeyed(automatic.request);

		const hourly = await run(
			{ resource: 'plan', operation: 'getTraffic', planId: plan(), days: 2, granularity: 'hour' },
			answer({ points: [] }),
		);
		assert.deepEqual(hourly.request.query, { days: '2', granularity: 'hour' });
	});
});

describe('Account', () => {
	it('Get Balance reads the wallet', async () => {
		const body = { balanceCents: 25765, currency: 'USD' };
		const { request, items } = await run(
			{ resource: 'account', operation: 'getBalance' },
			answer(body),
		);
		assert.equal(request.method, 'GET');
		assert.equal(request.url, 'https://hproxy.com/api/v1/wallet');
		assertKeyed(request);
		assert.deepEqual(items[0].json, body);
	});

	it('Get Bandwidth History reads the usage window, narrowed to one plan when filtered', async () => {
		const plain = await run(
			{ resource: 'account', operation: 'getBandwidthHistory' },
			answer({ daily: [] }),
		);
		assert.equal(plain.request.url, 'https://hproxy.com/api/v1/usage?days=30');
		assertKeyed(plain.request);

		const filtered = await run(
			{
				resource: 'account',
				operation: 'getBandwidthHistory',
				days: 7,
				filters: { planId: plan() },
			},
			answer({ daily: [] }),
		);
		assert.deepEqual(filtered.request.query, { days: '7', plan_id: PLAN_ID });

		const emptyFilter = await run(
			{ resource: 'account', operation: 'getBandwidthHistory', filters: { planId: plan('') } },
			answer({ daily: [] }),
		);
		assert.deepEqual(emptyFilter.request.query, { days: '30' });
	});
});

describe('Keyless operations: Proxy > Get Many, Proxy > Check, IP Address > Get (no API key)', () => {
	const row = {
		ip: '203.0.113.7',
		port: 1080,
		protocols: ['socks5'],
		anonymity: 'elite',
		country_code: 'US',
		region: 'New York',
		city: 'New York',
		latitude: 40.71,
		longitude: -74,
		asn: 14061,
		asn_org: 'Example Hosting',
		is_datacenter: true,
		latency_ms: 142,
		last_verified_at: '2026-07-22T15:41:09Z',
		last_alive_at: '2026-07-22T15:41:09Z',
		status: 'alive',
		uptime_pct: 71.4,
		uptime_24h: 83.3,
		uptime_7d: 74.9,
		status_since: '2026-07-22T09:12:00Z',
		reliability: 'flaky',
		verification_count: 321,
	};

	it('Proxy > Get Many asks for JSON, sends the limit, never the key, and simplifies each row', async () => {
		const { request, items, error } = await run(
			{ resource: 'proxy', operation: 'getMany' },
			answer([row, { ...row, ip: '198.51.100.3' }]),
		);
		assert.equal(error, undefined);
		assert.equal(request.method, 'GET');
		assert.equal(request.path, '/api/proxy-list');
		assert.deepEqual(request.query, { format: 'json', limit: '50' });
		assert.equal(request.headers['X-API-Key'], undefined);
		assert.equal(items.length, 2);
		assert.deepEqual(Object.keys(items[0].json), [
			'ip',
			'port',
			'protocols',
			'anonymity',
			'country_code',
			'city',
			'asn_org',
			'latency_ms',
			'uptime_pct',
			'last_verified_at',
		]);
	});

	it('Proxy > Get Many turns every filter into the query the API documents', async () => {
		const { request, items } = await run(
			{
				resource: 'proxy',
				operation: 'getMany',
				returnAll: true,
				simplify: false,
				filters: {
					anonymity: 'anonymous',
					asn: 14061,
					country: 'de',
					maxLatencyMs: 800,
					minUptimePct: 70,
					port: 1080,
					protocols: ['socks5', 'http'],
					recent: true,
					subnet: '45.61.188',
				},
				options: { sortBy: 'uptime' },
			},
			answer([row]),
		);
		assert.deepEqual(request.query, {
			format: 'json',
			anonymity: 'anonymous',
			asn: '14061',
			country: 'DE',
			max_latency_ms: '800',
			min_uptime_pct: '70',
			port: '1080',
			protocol: 'socks5,http',
			recent: 'true',
			subnet: '45.61.188',
			sort: 'uptime',
		});
		assert.deepEqual(items[0].json, row);
	});

	it('Proxy > Get Many leaves ASN and port open at 0 and refuses a malformed subnet', async () => {
		const open = await run(
			{ resource: 'proxy', operation: 'getMany', filters: { asn: 0, port: 0 } },
			answer([]),
		);
		assert.deepEqual(open.request.query, { format: 'json', limit: '50' });

		const bad = await run(
			{ resource: 'proxy', operation: 'getMany', filters: { subnet: '45.61' } },
			answer([]),
		);
		assert.equal(bad.requests.length, 0);
		assert.equal(bad.error.message, 'The "Subnet" filter is outside what HProxy takes');
	});

	it('IP Address > Get reads one address and keeps ten fields with Simplify on', async () => {
		const body = {
			ip: '8.8.8.8',
			country: 'US',
			country_name: 'United States',
			region: 'California',
			city: 'Mountain View',
			latitude: 37.4,
			longitude: -122.1,
			timezone: 'America/Los_Angeles',
			asn: 15169,
			asn_org: 'Google LLC',
			isp: 'Google LLC',
			is_datacenter: true,
		};
		const { request, items } = await run(
			{ resource: 'ipAddress', operation: 'get', ip: ' 8.8.8.8 ' },
			answer(body),
		);
		assert.equal(request.method, 'GET');
		assert.equal(request.url, 'https://hproxy.com/api/ip/8.8.8.8');
		assert.equal(request.headers['X-API-Key'], undefined);
		assert.equal(Object.keys(items[0].json).length, 10);
		assert.equal(items[0].json.latitude, undefined);

		const ipv6 = await run(
			{ resource: 'ipAddress', operation: 'get', ip: '2001:4860:4860::8888' },
			answer(body),
		);
		assert.equal(ipv6.request.path, '/api/ip/2001:4860:4860::8888');
	});

	it('IP Address > Get sends nothing when the field holds something other than an address', async () => {
		const { requests, error } = await run({
			resource: 'ipAddress',
			operation: 'get',
			ip: '8.8.8.8/../../api/v1/wallet',
		});
		assert.equal(requests.length, 0);
		assert.equal(error.message, 'The "IP Address" field needs an IPv4 or IPv6 address');
	});

	it('Proxy > Check posts the list from new lines and commas and returns one item per result', async () => {
		const results = [
			{
				input: '203.0.113.7:1080',
				status: 'alive',
				alive: true,
				protocols: ['socks5'],
				latency_ms: 184,
			},
			{
				input: '198.51.100.3:8080',
				status: 'dead',
				alive: false,
				protocols: [],
				failure: 'timeout',
			},
		];
		const { request, items } = await run(
			{
				resource: 'proxy',
				operation: 'check',
				proxies: '203.0.113.7:1080\n198.51.100.3:8080, ',
				simplify: false,
			},
			answer({ count: 2, results, complete: true, unchecked: 0 }),
		);
		assert.equal(request.method, 'POST');
		assert.equal(request.url, 'https://hproxy.com/api/proxy-check');
		assert.equal(request.headers['X-API-Key'], undefined);
		assert.deepEqual(request.body, { proxies: ['203.0.113.7:1080', '198.51.100.3:8080'] });
		assert.deepEqual(
			items.map((item) => item.json),
			results,
		);
	});

	it('Proxy > Check takes a list from an expression and refuses more than 1,000', async () => {
		const mapped = await harness.run({
			parameters: {
				resource: 'proxy',
				operation: 'check',
				proxies: '={{ $json.lines }}',
			},
			input: { lines: ['203.0.113.7:1080', '198.51.100.3:8080'] },
			transport: answer({ results: [] }),
		});
		assert.deepEqual(mapped.requests[0].body, {
			proxies: ['203.0.113.7:1080', '198.51.100.3:8080'],
		});

		const tooMany = Array.from({ length: 1001 }, (_, i) => `203.0.113.${i % 250}:${1000 + i}`).join(
			'\n',
		);
		const big = await run({ resource: 'proxy', operation: 'check', proxies: tooMany });
		assert.equal(big.requests.length, 0);
		assert.match(big.error.message, /1001 proxies, more than 1000 per run/);
	});
});

describe('Refusals from HProxy', () => {
	const generate = { resource: 'proxy', operation: 'generate', planId: plan() };

	it('401 says the key was not accepted and declares the credential invalid', async () => {
		const { error } = await run(
			generate,
			answer(
				{ error: 'Missing or invalid API key.', code: 'unauthorized', requestId: 'req-1' },
				401,
			),
		);
		assert.ok(error instanceof NodeApiError);
		assert.equal(error.message, 'HProxy did not accept the API key');
		assert.equal(error.httpCode, '401');
		assert.match(error.description, /Settings > API keys/);
		assert.match(error.description, /Request ID for support: req-1\./);
		assert.deepEqual(error.failure, { cause: 'credential-invalid' });
	});

	it('403 missing_scope names the permission to add', async () => {
		const { error } = await run(
			generate,
			answer({ error: "API key missing the 'buy' scope.", code: 'missing_scope' }, 403),
		);
		assert.equal(error.message, 'This API key lacks the permission this operation needs');
		assert.match(error.description, /"Read plans"/);
	});

	it('404 explains that the plan is not on the account or not active', async () => {
		const { error } = await run(
			generate,
			answer({ error: 'Plan not found.', code: 'not_found' }, 404),
		);
		assert.equal(error.message, 'HProxy found no plan with this ID on your account');
		assert.equal(error.httpCode, '404');
	});

	it("400 shows HProxy's own sentence, which names the field", async () => {
		const { error } = await run(
			generate,
			answer({ error: 'count must be a whole number from 1 to 5000.', code: 'invalid_count' }, 400),
		);
		assert.equal(error.message, 'count must be a whole number from 1 to 5000');
		assert.equal(error.httpCode, '400');
	});

	it('429 tells how long to wait and declares the rate limit with the wait', async () => {
		const { error } = await run(
			{ resource: 'ipAddress', operation: 'get', ip: '8.8.8.8' },
			answer({ error: 'Too many lookups. Slow down and retry.', code: 'rate_limited' }, 429, {
				'retry-after': '7',
			}),
		);
		assert.equal(error.message, 'HProxy asked to slow down');
		assert.match(error.description, /^Wait 7 seconds before the next run/);
		assert.deepEqual(error.failure, { cause: 'rate-limited', retryAfterMs: 7000 });
	});

	it('5xx with an HTML page from a proxy in between stays readable', async () => {
		const { error } = await run(generate, answer('<html><body>502 Bad Gateway</body></html>', 502));
		assert.equal(error.message, 'HProxy could not answer right now');
		assert.equal(error.description, 'Try again in a minute.');
		assert.deepEqual(error.failure, { cause: 'temporarily-unavailable' });
	});
});

describe('Answers without the expected list', () => {
	it('turn into no items, never into an item without data', async () => {
		const plans = await run(
			{ resource: 'plan', operation: 'getAll' },
			answer({ unexpected: true }),
		);
		assert.equal(plans.error, undefined);
		assert.deepEqual(plans.items, []);

		const checked = await run(
			{ resource: 'proxy', operation: 'check', proxies: '203.0.113.7:1080' },
			answer({ count: 0 }),
		);
		assert.equal(checked.error, undefined);
		assert.deepEqual(checked.items, []);

		const listed = await run(
			{ resource: 'proxy', operation: 'getMany' },
			answer({ notAList: true }),
		);
		assert.equal(listed.error, undefined);
		assert.deepEqual(listed.items, []);
	});
});

'use strict';

/* The pure helpers of shared/parse.ts and the plan list the editor shows (listSearch/searchPlans.ts). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { NodeApiError } = require('n8n-workflow');

const NODE_DIST = path.join(__dirname, '..', 'dist', 'nodes', 'HProxy');
const parse = require(path.join(NODE_DIST, 'shared', 'parse.js'));
const { searchPlans, planListItem } = require(path.join(NODE_DIST, 'listSearch', 'searchPlans.js'));

describe('parse helpers', () => {
	it('toList splits on new lines and commas, trims, drops blanks and takes arrays as they are', () => {
		assert.deepEqual(parse.toList(' a, b \n\nc,,'), ['a', 'b', 'c']);
		assert.deepEqual(parse.toList(['x ', ' ', 7]), ['x', '7']);
		assert.deepEqual(parse.toList(undefined), []);
		assert.deepEqual(parse.toList(''), []);
	});

	it('toWholeNumbers accepts digits only', () => {
		assert.deepEqual(parse.toWholeNumbers('7922, 7018'), [7922, 7018]);
		assert.equal(parse.toWholeNumbers('7922, AS7018'), null);
		assert.equal(parse.toWholeNumbers('1.5'), null);
		assert.deepEqual(parse.toWholeNumbers(''), []);
	});

	it('isPlanId and looksLikeIp let only ID and address characters into a URL', () => {
		assert.equal(parse.isPlanId('cmjfmhhpd004c4i4hqsk3mzrr'), true);
		assert.equal(parse.isPlanId('plan_1-A'), true);
		for (const bad of ['', '../wallet', 'a/b', 'a?b', 'a b', 'x'.repeat(65), 42]) {
			assert.equal(parse.isPlanId(bad), false, String(bad));
		}
		for (const good of ['8.8.8.8', '2001:4860:4860::8888', '::1']) {
			assert.equal(parse.looksLikeIp(good), true, good);
		}
		for (const bad of ['', '8', 'localhost', '8.8.8.8/x', '8.8.8.8?a=1', '%2e%2e']) {
			assert.equal(parse.looksLikeIp(bad), false, bad);
		}
	});

	it("productName, formatGb and retryAfterSeconds read the API's values for people", () => {
		assert.equal(parse.productName('residential-premium'), 'Residential Premium');
		assert.equal(parse.productName(undefined), 'Plan');
		assert.equal(parse.formatGb(3.2), '3.2');
		assert.equal(parse.formatGb(10), '10');
		assert.equal(parse.formatGb(0.044), '0.04');
		assert.equal(parse.formatGb(null), '0');
		assert.equal(parse.retryAfterSeconds({ 'retry-after': '7' }), 7);
		assert.equal(parse.retryAfterSeconds({ 'Retry-After': 2.2 }), 3);
		assert.equal(parse.retryAfterSeconds({}), undefined);
		assert.equal(parse.retryAfterSeconds({ 'retry-after': 'soon' }), undefined);
	});
});

describe('plan list', () => {
	const plans = [
		{
			id: 'cmplanaaa',
			productId: 'residential-premium',
			status: 'active',
			dataGbTotal: 10,
			dataGbRemaining: 3.2,
			label: 'customer-1042',
		},
		{
			id: 'cmplanbbb',
			productId: 'residential-lite',
			status: 'used_up',
			dataGbTotal: 5,
			dataGbRemaining: 0,
			label: null,
		},
	];

	function loader(resource, response) {
		const calls = [];
		return {
			calls,
			context: {
				getNode: () => ({
					name: 'HProxy',
					type: '@hproxy/n8n-nodes-hproxy.hProxy',
					typeVersion: 1,
				}),
				getCurrentNodeParameter: (name) => (name === 'resource' ? resource : undefined),
				helpers: {
					httpRequestWithAuthentication: async function (credentialType, options) {
						calls.push({ credentialType, options });
						return response;
					},
				},
			},
		};
	}

	it('names each plan with its product, the GB left, its state and its label', () => {
		assert.deepEqual(planListItem(plans[0]), {
			name: 'Residential Premium, 3.2 of 10 GB left (customer-1042)',
			value: 'cmplanaaa',
		});
		assert.deepEqual(planListItem(plans[1]), {
			name: 'Residential Lite, 0 of 5 GB left, used up',
			value: 'cmplanbbb',
		});
	});

	it('asks for the active plans when generating, all plans otherwise, with the credential', async () => {
		const forProxy = loader('proxy', { statusCode: 200, headers: {}, body: { plans: [plans[0]] } });
		const result = await searchPlans.call(forProxy.context);
		assert.deepEqual(
			result.results.map((item) => item.value),
			['cmplanaaa'],
		);
		assert.equal(forProxy.calls[0].credentialType, 'hProxyApi');
		assert.equal(forProxy.calls[0].options.baseURL, 'https://hproxy.com');
		assert.equal(forProxy.calls[0].options.url, '/api/v1/plans');
		assert.deepEqual(forProxy.calls[0].options.qs, { status: 'active' });

		const forPlan = loader('plan', { statusCode: 200, headers: {}, body: { plans } });
		await searchPlans.call(forPlan.context);
		assert.deepEqual(forPlan.calls[0].options.qs, { status: 'all' });
	});

	it('filters by the typed text', async () => {
		const { context } = loader('plan', { statusCode: 200, headers: {}, body: { plans } });
		assert.deepEqual(
			(await searchPlans.call(context, 'LITE')).results.map((item) => item.value),
			['cmplanbbb'],
		);
		assert.deepEqual(
			(await searchPlans.call(context, 'cmplanaaa')).results.map((item) => item.value),
			['cmplanaaa'],
		);
		assert.equal((await searchPlans.call(context, 'nothing like it')).results.length, 0);
	});

	it('turns a refusal into the same message the operations show', async () => {
		const { context } = loader('plan', {
			statusCode: 401,
			headers: {},
			body: { error: 'Missing or invalid API key.', code: 'unauthorized' },
		});
		await assert.rejects(searchPlans.call(context), (error) => {
			assert.ok(error instanceof NodeApiError);
			assert.equal(error.message, 'HProxy did not accept the API key');
			return true;
		});
	});
});

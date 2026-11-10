'use strict';

/*
 * The parts of the package n8n and its reviewers look at without running a request:
 * the credential, the node description, the endpoints it may call, package.json, the
 * published files and the words of the README.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const pkg = require(path.join(ROOT, 'package.json'));
const { HProxy } = require(path.join(DIST, 'nodes', 'HProxy', 'HProxy.node.js'));
const { HProxyApi } = require(path.join(DIST, 'credentials', 'HProxyApi.credentials.js'));
const { checkResponse } = require(path.join(DIST, 'nodes', 'HProxy', 'shared', 'errors.js'));
const { requireApiKey } = require(path.join(DIST, 'nodes', 'HProxy', 'shared', 'hooks.js'));

const description = new HProxy().description;

/** Every operation option of the node with its resource. */
function operations() {
	return description.properties
		.filter((property) => property.name === 'operation')
		.flatMap((property) =>
			property.options.map((option) => ({
				resource: property.displayOptions.show.resource[0],
				option,
			})),
		);
}

function walkFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(directory, entry.name);
		return entry.isDirectory() ? walkFiles(full) : [full];
	});
}

describe('credential HProxy API', () => {
	const credential = new HProxyApi();

	it('sends the key as X-API-Key and tests it with GET /api/v1/me', () => {
		assert.equal(credential.name, 'hProxyApi');
		assert.equal(credential.displayName, 'HProxy API');
		assert.deepEqual(credential.authenticate, {
			type: 'generic',
			properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}' } },
		});
		assert.deepEqual(credential.test.request, {
			baseURL: 'https://hproxy.com',
			url: '/api/v1/me',
			method: 'GET',
		});
	});

	it('keeps the key in a password field', () => {
		const [field] = credential.properties;
		assert.equal(field.name, 'apiKey');
		assert.equal(field.typeOptions.password, true);
		assert.equal(credential.properties.length, 1);
	});
});

describe('node description', () => {
	it('is a usable-as-tool node with themed icons and a subtitle', () => {
		assert.equal(description.name, 'hProxy');
		assert.equal(description.displayName, 'HProxy');
		assert.equal(description.usableAsTool, true);
		assert.deepEqual(description.icon, {
			light: 'file:../../icons/hproxy.svg',
			dark: 'file:../../icons/hproxy.dark.svg',
		});
		for (const file of ['hproxy.svg', 'hproxy.dark.svg']) {
			assert.ok(fs.existsSync(path.join(DIST, 'icons', file)), `dist/icons/${file} is built`);
		}
		assert.ok(description.subtitle);
	});

	it('shows the credential for the keyed resources only, so the free tools run without a key', () => {
		assert.deepEqual(description.credentials, [
			{ name: 'hProxyApi', displayOptions: { show: { resource: ['account', 'plan', 'proxy'] } } },
		]);
	});

	it('calls exactly these endpoints and nothing that orders, pays, deposits, deletes or rotates passwords', () => {
		const calls = operations()
			.map(
				({ resource, option }) =>
					`${resource}.${option.value} ${option.routing.request.method} ${option.routing.request.url}`,
			)
			.sort();
		assert.deepEqual(calls, [
			'account.getBalance GET /api/v1/wallet',
			'account.getBandwidthHistory GET /api/v1/usage',
			'freeTool.checkProxies POST /api/proxy-check',
			'freeTool.getFreeProxies GET /api/proxy-list',
			'freeTool.lookUpIp GET =/api/ip/{{ String($parameter.ip).trim() }}',
			'plan.get GET =/api/v1/plans/{{$parameter.planId}}',
			'plan.getAll GET /api/v1/plans',
			'plan.getTraffic GET =/api/v1/plans/{{$parameter.planId}}/stats',
			'proxy.generate POST =/api/v1/plans/{{$parameter.planId}}/generate',
		]);
		for (const call of calls) {
			assert.doesNotMatch(
				call,
				/password|orders|deposits|webhooks|whitelist|release-sessions|customer/i,
			);
			assert.doesNotMatch(call, / (DELETE|PATCH|PUT) /);
		}
	});

	it('checks every answer first, and asks for the key first on every keyed operation', () => {
		for (const { resource, option } of operations()) {
			assert.equal(
				option.routing.output.postReceive[0],
				checkResponse,
				`${resource}.${option.value}`,
			);
			const keyed = description.credentials[0].displayOptions.show.resource.includes(resource);
			const firstPreSend = (option.routing.send?.preSend ?? [])[0];
			if (keyed) {
				assert.equal(firstPreSend, requireApiKey, `${resource}.${option.value} asks for the key`);
			} else {
				assert.notEqual(
					firstPreSend,
					requireApiKey,
					`${resource}.${option.value} runs without a key`,
				);
			}
		}
	});

	it("sends every request to hproxy.com and reads HProxy's refusals itself", () => {
		assert.equal(description.requestDefaults.baseURL, 'https://hproxy.com');
		assert.equal(description.requestDefaults.ignoreHttpStatusErrors, true);
	});
});

describe('package.json', () => {
	it("follows n8n's rules for verified community nodes", () => {
		assert.match(pkg.name, /^@hproxy\/n8n-nodes-/);
		assert.ok(pkg.keywords.includes('n8n-community-node-package'));
		assert.equal(pkg.license, 'MIT');
		assert.equal(pkg.dependencies, undefined, 'no runtime dependencies');
		assert.deepEqual(pkg.peerDependencies, { 'n8n-workflow': '*' });
		assert.deepEqual(pkg.files, ['dist']);
		assert.deepEqual(pkg.publishConfig, { access: 'public' });
		assert.equal(pkg.repository.url, 'git+https://github.com/hproxy-com/n8n-nodes-hproxy.git');
		assert.equal(pkg.n8n.strict, true);
		for (const file of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) {
			assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is built`);
		}
	});

	it('pins every dev dependency to an exact version', () => {
		for (const [name, version] of Object.entries(pkg.devDependencies)) {
			assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is pinned`);
		}
	});

	it('runs no install scripts of its own', () => {
		for (const script of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']) {
			assert.equal(pkg.scripts[script], undefined, script);
		}
	});
});

describe('words and names', () => {
	const builtText = walkFiles(DIST)
		.filter((file) => /\.(js|json)$/.test(file))
		.map((file) => [path.relative(ROOT, file), fs.readFileSync(file, 'utf8')]);
	const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
	const texts = [
		...builtText,
		['README.md', readme],
		['package.json description', pkg.description],
	];

	it('names no gateway host except the example host', () => {
		for (const [name, text] of texts) {
			for (const host of text.match(/[a-z0-9-]+\.hproxy\.com/gi) ?? []) {
				assert.ok(
					['example.hproxy.com', 'mcp.hproxy.com'].includes(host.toLowerCase()),
					`${name} names ${host}`,
				);
			}
		}
	});

	it('never writes a proxy login itself', () => {
		for (const [name, text] of texts) {
			assert.doesNotMatch(text, /-(country|session|sessid|lifetime|type)-[a-z0-9{$]/i, name);
			assert.doesNotMatch(text, /type-residential/i, name);
		}
	});

	it('uses no em or en dashes and no emoji', () => {
		for (const [name, text] of texts) {
			assert.doesNotMatch(text, /[–—]/, `${name} holds a long dash`);
			assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `${name} holds an emoji`);
		}
	});

	it('avoids the "X is not A, it is B", "not A but B" and "less about A, more about B" shapes', () => {
		const prose = [['README.md', readme], ...builtText.filter(([name]) => name.endsWith('.js'))];
		const shapes = [
			// "X is not A, it is B", "X does not A, it Bs", "X is not A. It is B."
			/\b(?:(?:is|are|was|were|does|do|did)\s+not|isn't|aren't|wasn't|weren't|doesn't|don't|didn't)\b[^.!?\n]{0,80}[,.;]\s*(?:it|they|this|that)\s+[a-z]+/i,
			// "not A but B", "not because A, but because B"
			/\bnot (?:only |just |because )?[a-z][^.!?\n]{0,60}\bbut\b/i,
			// "less about A, more about B"
			/\bless about\b[^.!?\n]{0,60}\bmore about\b/i,
		];
		for (const [name, text] of prose) {
			for (const shape of shapes) {
				assert.doesNotMatch(text, shape, name);
			}
		}
	});
});

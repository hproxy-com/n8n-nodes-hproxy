/** Every request of this node goes to HProxy's public API on this origin. */
export const HPROXY_ORIGIN = 'https://hproxy.com';

/** The credential type this node authenticates with (see credentials/HProxyApi.credentials.ts). */
export const CREDENTIAL_TYPE = 'hProxyApi';

/**
 * The resources with operations that call HProxy with an API key: every operation of Account and
 * Plan, and Proxy > Generate. IP Address > Get needs no key, so IP Address is not listed.
 */
export const KEYED_RESOURCES = ['account', 'plan', 'proxy'];

/**
 * The operations of a keyed resource that need no key: Proxy > Check and Proxy > Get Many,
 * HProxy's free proxy checker and free proxy list. The credential is hidden for them by operation
 * value alone (n8n joins hide rules with OR and show rules with AND), so no keyed operation may use
 * these values; that is why the free list's Get Many has the value getMany and not getAll, which
 * Plan > Get Many already uses. test/description.test.js checks both rules.
 */
export const KEYLESS_OPERATIONS = ['check', 'getMany'];

/** The most proxies one free check takes (POST /api/proxy-check). */
export const MAX_PROXIES_PER_CHECK = 1000;

/** The most entries one exclusion list may carry on POST /api/v1/plans/{id}/generate. */
export const MAX_EXCLUSIONS = 20;

/** The fields Simplify keeps, most used first, at most ten each (n8n's UX guidelines). */
export const SIMPLE_FIELDS = {
	freeProxy: [
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
	],
	proxyCheck: [
		'input',
		'status',
		'alive',
		'protocols',
		'anonymity',
		'latency_ms',
		'exit_ip',
		'country_code',
		'city',
		'asn_org',
	],
	ipLookup: [
		'ip',
		'country',
		'country_name',
		'region',
		'city',
		'timezone',
		'asn',
		'asn_org',
		'isp',
		'is_datacenter',
	],
} as const;

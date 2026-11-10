/** Every request of this node goes to HProxy's public API on this origin. */
export const HPROXY_ORIGIN = 'https://hproxy.com';

/** The credential type this node authenticates with (see credentials/HProxyApi.credentials.ts). */
export const CREDENTIAL_TYPE = 'hProxyApi';

/** The resources that call HProxy with an API key. The free tools need no key. */
export const KEYED_RESOURCES = ['account', 'plan', 'proxy'];

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

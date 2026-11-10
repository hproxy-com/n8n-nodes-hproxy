import { NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteSingleFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	PostReceiveAction,
	PreSendAction,
} from 'n8n-workflow';
import { CREDENTIAL_TYPE, MAX_EXCLUSIONS, MAX_PROXIES_PER_CHECK } from './constants';
import { isPlanId, looksLikeIp, pick, toList, toWholeNumbers } from './parse';

/*
 * The code half of the declarative node: preSend hooks check and shape a request after n8n
 * built it from the routing blocks, postReceive hooks shape HProxy's answer into items.
 * Proxy lines are passed through exactly as HProxy generated them, never assembled here.
 */

const asObject = (value: unknown): IDataObject =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as IDataObject) : {};

const isEmpty = (value: unknown) =>
	value === undefined ||
	value === null ||
	(typeof value === 'string' && value.trim() === '') ||
	(Array.isArray(value) && value.length === 0);

function fieldMessage(
	context: IExecuteSingleFunctions,
	message: string,
	description: string,
): NodeOperationError {
	return new NodeOperationError(context.getNode(), message, {
		description,
		itemIndex: context.getItemIndex(),
	});
}

/** Keyed operations: stops before any request when no HProxy credential is selected. */
export const requireApiKey: PreSendAction = async function (
	this: IExecuteSingleFunctions,
	requestOptions,
) {
	try {
		await this.getCredentials(CREDENTIAL_TYPE);
	} catch {
		throw new NodeOperationError(this.getNode(), 'This operation needs an HProxy API key', {
			description:
				'Select an HProxy credential under "Credential to connect with", or create one with a key from your HProxy dashboard, under Settings > API keys.',
			itemIndex: this.getItemIndex(),
		});
	}
	return requestOptions;
};

/** Plan operations: the plan ID goes into the URL, so it may only hold ID characters. */
export const requirePlanId: PreSendAction = async function (
	this: IExecuteSingleFunctions,
	requestOptions,
) {
	const planId = this.getNodeParameter('planId', undefined, { extractValue: true });
	if (!isPlanId(planId)) {
		throw fieldMessage(
			this,
			'The "Plan" field needs a plan ID',
			'Pick a plan from the list, or enter its ID, such as cmjfmhhpd004c4i4hqsk3mzrr. IDs hold letters, digits, dashes and underscores.',
		);
	}
	return requestOptions;
};

/** Removes fields that were added but left empty, from the body and the query, so HProxy only sees real values. */
export const dropEmptyFields: PreSendAction = async function (
	this: IExecuteSingleFunctions,
	requestOptions,
) {
	for (const target of [requestOptions.body, requestOptions.qs]) {
		if (target && typeof target === 'object' && !Array.isArray(target)) {
			const fields = target as IDataObject;
			for (const key of Object.keys(fields)) {
				if (isEmpty(fields[key])) {
					delete fields[key];
				}
			}
		}
	}
	return requestOptions;
};

const TEXT_EXCLUSIONS: Array<[key: string, label: string]> = [
	['excludeCities', 'Exclude Cities'],
	['excludeCountries', 'Exclude Countries'],
	['excludeStates', 'Exclude States'],
];

/** Generate: trims the targeting text and turns the exclusion fields into the lists the API takes. */
export const prepareGenerateBody: PreSendAction = async function (
	this: IExecuteSingleFunctions,
	requestOptions,
) {
	const body = asObject(requestOptions.body);

	for (const key of ['country', 'state', 'city', 'isp']) {
		if (typeof body[key] === 'string') {
			body[key] = (body[key] as string).trim();
		}
	}

	// "Network (ASN)" shows 0 until a number is typed: 0 leaves the network open.
	if (body.asn === 0) {
		delete body.asn;
	}

	for (const [key, label] of TEXT_EXCLUSIONS) {
		if (key in body) {
			body[key] = toList(body[key]);
			if ((body[key] as string[]).length > MAX_EXCLUSIONS) {
				throw fieldMessage(
					this,
					`The "${label}" field lists more than ${MAX_EXCLUSIONS} entries`,
					`HProxy takes up to ${MAX_EXCLUSIONS} per request. Shorten the list.`,
				);
			}
		}
	}

	if ('excludeAsn' in body) {
		const networks = toWholeNumbers(body.excludeAsn);
		if (networks === null) {
			throw fieldMessage(
				this,
				'The "Exclude Networks (ASN)" field needs AS numbers',
				'Enter whole numbers separated by commas, such as 7922, 7018.',
			);
		}
		if (networks.length > MAX_EXCLUSIONS) {
			throw fieldMessage(
				this,
				`The "Exclude Networks (ASN)" field lists more than ${MAX_EXCLUSIONS} entries`,
				`HProxy takes up to ${MAX_EXCLUSIONS} per request. Shorten the list.`,
			);
		}
		body.excludeAsn = networks;
	}

	requestOptions.body = body;
	return requestOptions;
};

/** Check Proxies: the typed or mapped list becomes { proxies: [...] }, 1 to 1,000 entries. */
export const prepareProxyCheckBody: PreSendAction = async function (
	this: IExecuteSingleFunctions,
	requestOptions,
) {
	const proxies = toList(this.getNodeParameter('proxies'));
	if (proxies.length === 0) {
		throw fieldMessage(
			this,
			'The "Proxies" field is empty',
			'Enter one proxy per line or separate them with commas, such as 203.0.113.7:1080.',
		);
	}
	if (proxies.length > MAX_PROXIES_PER_CHECK) {
		throw fieldMessage(
			this,
			`The "Proxies" field holds ${proxies.length} proxies, more than ${MAX_PROXIES_PER_CHECK} per run`,
			`Split the list into parts of up to ${MAX_PROXIES_PER_CHECK}, for example with the Loop Over Items node.`,
		);
	}
	requestOptions.body = { proxies };
	return requestOptions;
};

/** Look Up IP: the address goes into the URL, so only address characters may pass. */
export const requireIpAddress: PreSendAction = async function (
	this: IExecuteSingleFunctions,
	requestOptions,
) {
	const ip = String(this.getNodeParameter('ip') ?? '').trim();
	if (!looksLikeIp(ip)) {
		throw fieldMessage(
			this,
			'The "IP Address" field needs an IPv4 or IPv6 address',
			'Enter one public address, such as 8.8.8.8 or 2001:4860:4860::8888.',
		);
	}
	return requestOptions;
};

const ANONYMITY = ['anonymous', 'elite', 'transparent'];
const PROTOCOLS = ['http', 'https', 'socks4', 'socks5'];

/** Get Free Proxies: the filters and options become the query of GET /api/proxy-list. */
export const prepareFreeProxyQuery: PreSendAction = async function (
	this: IExecuteSingleFunctions,
	requestOptions,
) {
	const filters = asObject(this.getNodeParameter('filters', {}));
	const options = asObject(this.getNodeParameter('options', {}));
	const qs: IDataObject = { ...asObject(requestOptions.qs), format: 'json' };

	const wholeIn = (value: unknown, min: number, max: number) =>
		typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
	const reject = (label: string, rule: string) =>
		fieldMessage(this, `The "${label}" filter is outside what HProxy takes`, rule);

	if (typeof filters.anonymity === 'string' && ANONYMITY.includes(filters.anonymity)) {
		qs.anonymity = filters.anonymity;
	}
	if (filters.asn !== undefined && filters.asn !== 0) {
		if (!wholeIn(filters.asn, 1, 4294967295))
			throw reject('ASN', 'Enter an AS number, such as 14061.');
		qs.asn = filters.asn;
	}
	if (typeof filters.country === 'string' && filters.country.trim()) {
		const country = filters.country.trim().toUpperCase();
		if (!/^[A-Z]{2}$/.test(country))
			throw reject('Country', 'Enter a two-letter country code, such as US or DE.');
		qs.country = country;
	}
	if (filters.maxLatencyMs !== undefined && filters.maxLatencyMs !== 0) {
		if (!wholeIn(filters.maxLatencyMs, 1, 120000))
			throw reject('Max Latency (Ms)', 'Enter 1 to 120,000 milliseconds.');
		qs.max_latency_ms = filters.maxLatencyMs;
	}
	if (filters.minUptimePct !== undefined && filters.minUptimePct !== 0) {
		if (
			typeof filters.minUptimePct !== 'number' ||
			filters.minUptimePct < 0 ||
			filters.minUptimePct > 100
		) {
			throw reject('Min Uptime (%)', 'Enter a percentage from 0 to 100.');
		}
		qs.min_uptime_pct = filters.minUptimePct;
	}
	if (filters.port !== undefined && filters.port !== 0) {
		if (!wholeIn(filters.port, 1, 65535)) throw reject('Port', 'Enter a port from 1 to 65,535.');
		qs.port = filters.port;
	}
	if (Array.isArray(filters.protocols)) {
		const protocols = filters.protocols.filter(
			(p): p is string => typeof p === 'string' && PROTOCOLS.includes(p),
		);
		if (protocols.length > 0) qs.protocol = protocols.join(',');
	}
	if (filters.recent === true) {
		qs.recent = 'true';
	}
	if (typeof filters.subnet === 'string' && filters.subnet.trim()) {
		const subnet = filters.subnet.trim();
		if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnet)) {
			throw reject('Subnet', 'Enter the first three parts of an address, such as 45.61.188.');
		}
		qs.subnet = subnet;
	}
	if (options.sortBy === 'uptime') {
		qs.sort = 'uptime';
	}

	requestOptions.qs = qs;
	return requestOptions;
};

/** Generate: one item per proxy line, exactly as HProxy generated it. */
export const linesToItems: PostReceiveAction = async function (
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
) {
	const body = asObject(response.body);
	const lines = Array.isArray(body.lines) ? body.lines : [];
	const planId = this.getNodeParameter('planId', undefined, { extractValue: true }) as string;
	return lines
		.filter((line): line is string => typeof line === 'string')
		.map((line) => ({ json: { line, productId: body.productId ?? null, planId } }));
};

/**
 * One item per object in a list of the answer: the answer itself when it is a list (Get Free
 * Proxies), or one of its fields (plans, results). No list, no items: an answer without the
 * expected list never turns into an item without data.
 */
export function listToItems(property?: string): PostReceiveAction {
	return async function (
		this: IExecuteSingleFunctions,
		_items: INodeExecutionData[],
		response: IN8nHttpFullResponse,
	) {
		const list = property === undefined ? response.body : asObject(response.body)[property];
		if (!Array.isArray(list)) {
			return [];
		}
		return list
			.filter((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
			.map((entry) => ({ json: entry as IDataObject }));
	};
}

/** With "Simplify" on, keeps the given fields of every item, most used first. */
export function simplifyTo(fields: readonly string[]): PostReceiveAction {
	return async function (this: IExecuteSingleFunctions, items: INodeExecutionData[]) {
		if (this.getNodeParameter('simplify', true) !== true) {
			return items;
		}
		return items.map((item) => ({ ...item, json: pick(item.json, fields) }));
	};
}

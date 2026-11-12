import type { INodeProperties } from 'n8n-workflow';

const showForGetMany = { resource: ['proxy'], operation: ['getMany'] };

/** The fields of Proxy > Get Many (GET /api/proxy-list, HProxy's free proxy list, no key). */
export const getManyFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: showForGetMany },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 10000 },
		description: 'Max number of results to return',
		displayOptions: { show: { ...showForGetMany, returnAll: [false] } },
		routing: {
			send: { type: 'query', property: 'limit' },
			output: { maxResults: '={{$value}}' },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showForGetMany },
		options: [
			{
				displayName: 'Anonymity',
				name: 'anonymity',
				type: 'options',
				options: [
					{
						name: 'Anonymous',
						value: 'anonymous',
						description: 'Hides your IP but shows that a proxy is in use',
					},
					{
						name: 'Elite',
						value: 'elite',
						description: 'Hides your IP and that a proxy is in use',
					},
					{
						name: 'Transparent',
						value: 'transparent',
						description: 'Passes your IP on to the website',
					},
				],
				default: 'elite',
				description: 'Only proxies with this anonymity grade',
			},
			{
				displayName: 'ASN',
				name: 'asn',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, numberPrecision: 0 },
				description:
					'Only proxies in this network, by AS number such as 14061. 0 leaves the network open.',
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				placeholder: 'e.g. US',
				description: 'Only proxies in this country, as a two-letter code',
			},
			{
				displayName: 'Include Recently Alive',
				name: 'recent',
				type: 'boolean',
				default: false,
				description:
					'Whether to add proxies that stopped answering within the last 48 hours. They come with the status recently_alive.',
			},
			{
				displayName: 'Max Latency (Ms)',
				name: 'maxLatencyMs',
				type: 'number',
				default: 1000,
				typeOptions: { minValue: 1, maxValue: 120000, numberPrecision: 0 },
				description: 'Only proxies that answered within this many milliseconds',
			},
			{
				displayName: 'Min Uptime (%)',
				name: 'minUptimePct',
				type: 'number',
				default: 70,
				typeOptions: { minValue: 0, maxValue: 100 },
				description: 'Only proxies whose lifetime uptime is at least this percentage',
			},
			{
				displayName: 'Port',
				name: 'port',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, maxValue: 65535, numberPrecision: 0 },
				description: 'Only proxies answering on this port, such as 8080. 0 leaves the port open.',
			},
			{
				displayName: 'Protocols',
				name: 'protocols',
				type: 'multiOptions',
				options: [
					{ name: 'HTTP', value: 'http' },
					{ name: 'HTTPS', value: 'https' },
					{ name: 'SOCKS4', value: 'socks4' },
					{ name: 'SOCKS5', value: 'socks5' },
				],
				default: [],
				description: 'Only proxies that support at least one of these protocols',
			},
			{
				displayName: 'Subnet',
				name: 'subnet',
				type: 'string',
				default: '',
				placeholder: 'e.g. 45.61.188',
				description:
					'Only proxies inside one /24 block, given as the first three parts of the address',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForGetMany },
		options: [
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				options: [
					{
						name: 'Status and Speed',
						value: 'statusAndSpeed',
						description: 'Proxies answering now first, the fastest first',
					},
					{
						name: 'Uptime',
						value: 'uptime',
						description: 'The most reliable proxies over their lifetime first',
					},
				],
				default: 'statusAndSpeed',
				description: 'The order of the whole list, before the limit applies',
			},
		],
	},
];

import type { INodeProperties } from 'n8n-workflow';
import { SIMPLE_FIELDS } from '../../shared/constants';
import { simplifyField } from '../../shared/descriptions';
import { checkResponse } from '../../shared/errors';
import {
	listToItems,
	prepareFreeProxyQuery,
	prepareProxyCheckBody,
	requireIpAddress,
	simplifyTo,
} from '../../shared/hooks';

const showForFreeTool = (operation: string[]) => ({ resource: ['freeTool'], operation });

/**
 * Free Tool > Check Proxies, Get Free Proxies, Look Up IP: HProxy's keyless endpoints
 * (POST /api/proxy-check, GET /api/proxy-list, GET /api/ip/{ip}). No API key is sent.
 */
export const freeToolDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['freeTool'] } },
		options: [
			{
				name: 'Check Proxies',
				value: 'checkProxies',
				action: 'Check proxies',
				description:
					'Test proxies live and get their protocols, anonymity, speed and location, free without a key',
				routing: {
					request: { method: 'POST', url: '/api/proxy-check' },
					send: { preSend: [prepareProxyCheckBody] },
					output: {
						postReceive: [
							checkResponse,
							listToItems('results'),
							simplifyTo(SIMPLE_FIELDS.proxyCheck),
						],
					},
				},
			},
			{
				name: 'Get Free Proxies',
				value: 'getFreeProxies',
				action: 'Get free proxies',
				description: 'Get working public proxies from the free proxy list, free without a key',
				routing: {
					request: { method: 'GET', url: '/api/proxy-list' },
					send: { preSend: [prepareFreeProxyQuery] },
					output: {
						postReceive: [checkResponse, listToItems(), simplifyTo(SIMPLE_FIELDS.freeProxy)],
					},
				},
			},
			{
				name: 'Look Up IP',
				value: 'lookUpIp',
				action: 'Look up an IP address',
				description: 'Get the country, city, network and ISP of an IP address, free without a key',
				routing: {
					request: { method: 'GET', url: '=/api/ip/{{ String($parameter.ip).trim() }}' },
					send: { preSend: [requireIpAddress] },
					output: {
						postReceive: [checkResponse, simplifyTo(SIMPLE_FIELDS.ipLookup)],
					},
				},
			},
		],
		default: 'getFreeProxies',
	},
	{
		displayName: 'Proxies',
		name: 'proxies',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 4 },
		placeholder: 'e.g. 203.0.113.7:1080',
		description:
			'Up to 1,000 proxies, one per line or separated by commas, written as ip:port, host:port:user:pass or user:pass@host:port',
		displayOptions: { show: showForFreeTool(['checkProxies']) },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: showForFreeTool(['getFreeProxies']) },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 10000 },
		description: 'Max number of results to return',
		displayOptions: { show: { ...showForFreeTool(['getFreeProxies']), returnAll: [false] } },
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
		displayOptions: { show: showForFreeTool(['getFreeProxies']) },
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
		displayOptions: { show: showForFreeTool(['getFreeProxies']) },
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
	{
		displayName: 'IP Address',
		name: 'ip',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 8.8.8.8',
		description: 'A public IPv4 or IPv6 address',
		displayOptions: { show: showForFreeTool(['lookUpIp']) },
	},
	simplifyField({
		resource: ['freeTool'],
		operation: ['checkProxies', 'getFreeProxies', 'lookUpIp'],
	}),
];

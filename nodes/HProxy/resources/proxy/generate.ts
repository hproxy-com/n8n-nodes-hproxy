import type { INodeProperties } from 'n8n-workflow';
import { planLocator } from '../../shared/descriptions';

const showForGenerate = { resource: ['proxy'], operation: ['generate'] };

/** The fields of Proxy > Generate (POST /api/v1/plans/{id}/generate). */
export const generateFields: INodeProperties[] = [
	{
		...planLocator({
			required: true,
			description:
				'The plan to generate lines from. Only active plans with traffic left can generate.',
		}),
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Count',
		name: 'count',
		type: 'number',
		default: 1,
		typeOptions: { minValue: 1, maxValue: 5000, numberPrecision: 0 },
		description:
			'How many lines to return, from 1 to 5,000. Some plans allow fewer, and the answer then names the limit.',
		displayOptions: { show: showForGenerate },
		routing: { send: { type: 'body', property: 'count' } },
	},
	{
		displayName: 'Protocol',
		name: 'protocol',
		type: 'options',
		options: [
			{
				name: 'HTTP',
				value: 'http',
				description: 'Works in every client, Chrome and other Chromium browsers included',
			},
			{
				name: 'SOCKS5',
				value: 'socks5',
				description:
					'Carries any TCP traffic. Chromium browsers do not send SOCKS5 usernames and passwords.',
			},
		],
		default: 'http',
		description: 'The protocol the lines speak',
		displayOptions: { show: showForGenerate },
		routing: { send: { type: 'body', property: 'protocol' } },
	},
	{
		displayName: 'Session Type',
		name: 'sessionType',
		type: 'options',
		options: [
			{
				name: 'Rotating',
				value: 'rotating',
				description: 'Every request can leave from a different IP',
			},
			{
				name: 'Sticky',
				value: 'sticky',
				description: 'Each line keeps one IP for the session length',
			},
		],
		default: 'rotating',
		description: 'Whether each line changes its IP on every request or holds one IP',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Session Length (Minutes)',
		name: 'stickyMinutes',
		type: 'number',
		default: 30,
		typeOptions: { minValue: 1, maxValue: 1440, numberPrecision: 0 },
		description:
			'How long each line keeps its IP. Residential Premium takes 3 to 1,440 minutes. On Residential Lite any value keeps the IP for as long as the line is in use.',
		displayOptions: { show: { ...showForGenerate, sessionType: ['sticky'] } },
		routing: { send: { type: 'body', property: 'stickyMinutes' } },
	},
	{
		displayName: 'Country',
		name: 'country',
		type: 'string',
		default: '',
		placeholder: 'e.g. US',
		description:
			'Two-letter country code or English country name of the exit IP. Leave empty for any country.',
		displayOptions: { show: showForGenerate },
		routing: { send: { type: 'body', property: 'country' } },
	},
	{
		displayName: 'Targeting',
		name: 'targeting',
		type: 'collection',
		placeholder: 'Add Targeting',
		default: {},
		description:
			'Narrow the exit IPs further. A plan answers with a clear message when it does not take a field.',
		displayOptions: { show: showForGenerate },
		options: [
			{
				displayName: 'City',
				name: 'city',
				type: 'string',
				default: '',
				placeholder: 'e.g. New York',
				description: 'City of the exit IP, where the plan takes it',
				routing: { send: { type: 'body', property: 'city' } },
			},
			{
				displayName: 'Exclude Cities',
				name: 'excludeCities',
				type: 'string',
				default: '',
				placeholder: 'e.g. New York, Houston',
				description:
					'Up to 20 cities to avoid inside the country, separated by commas. Residential Premium plans.',
				routing: { send: { type: 'body', property: 'excludeCities' } },
			},
			{
				displayName: 'Exclude Countries',
				name: 'excludeCountries',
				type: 'string',
				default: '',
				placeholder: 'e.g. CN, RU',
				description:
					'Up to 20 two-letter country codes to avoid, separated by commas, when no country is set. Residential Premium plans.',
				routing: { send: { type: 'body', property: 'excludeCountries' } },
			},
			{
				displayName: 'Exclude Networks (ASN)',
				name: 'excludeAsn',
				type: 'string',
				default: '',
				placeholder: 'e.g. 7922, 7018',
				description:
					'Up to 20 AS numbers to avoid, separated by commas. Residential Premium plans.',
				routing: { send: { type: 'body', property: 'excludeAsn' } },
			},
			{
				displayName: 'Exclude States',
				name: 'excludeStates',
				type: 'string',
				default: '',
				placeholder: 'e.g. California, Texas',
				description:
					'Up to 20 states or regions to avoid inside the country, separated by commas. Residential Premium plans.',
				routing: { send: { type: 'body', property: 'excludeStates' } },
			},
			{
				displayName: 'ISP',
				name: 'isp',
				type: 'string',
				default: '',
				placeholder: 'e.g. Comcast',
				description: 'Internet provider of the exit IP, by name. Residential Plus plans.',
				routing: { send: { type: 'body', property: 'isp' } },
			},
			{
				displayName: 'Network (ASN)',
				name: 'asn',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, numberPrecision: 0 },
				description:
					'Network of the exit IP by AS number, such as 7922, together with a country. 0 leaves the network open. Residential Premium plans.',
				routing: { send: { type: 'body', property: 'asn' } },
			},
			{
				displayName: 'Operating System',
				name: 'os',
				type: 'options',
				options: [
					{ name: 'Android', value: 'android' },
					{ name: 'iOS', value: 'ios' },
					{ name: 'macOS', value: 'mac' },
					{ name: 'Windows', value: 'windows' },
				],
				default: 'windows',
				description: 'Device type the exit IP belongs to. Residential Premium plans.',
				routing: { send: { type: 'body', property: 'os' } },
			},
			{
				displayName: 'State',
				name: 'state',
				type: 'string',
				default: '',
				placeholder: 'e.g. California',
				description: 'State or region of the exit IP, where the plan takes it',
				routing: { send: { type: 'body', property: 'state' } },
			},
			{
				displayName: 'Strict Targeting',
				name: 'strict',
				type: 'boolean',
				default: true,
				description:
					'Whether a request fails when no IP matches the exact target. Off, the line falls back to another IP in the same country. Residential Premium plans.',
				routing: { send: { type: 'body', property: 'strict' } },
			},
			{
				displayName: 'UDP',
				name: 'udp',
				type: 'boolean',
				default: false,
				description:
					'Whether SOCKS5 lines may relay UDP traffic. Needs the SOCKS5 protocol. Residential Premium plans.',
				routing: { send: { type: 'body', property: 'udp' } },
			},
		],
	},
];

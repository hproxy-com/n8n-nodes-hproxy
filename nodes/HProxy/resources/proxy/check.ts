import type { INodeProperties } from 'n8n-workflow';

/** The field of Proxy > Check (POST /api/proxy-check, HProxy's free proxy checker, no key). */
export const checkFields: INodeProperties[] = [
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
		displayOptions: { show: { resource: ['proxy'], operation: ['check'] } },
	},
];

import type { INodeProperties } from 'n8n-workflow';
import { SIMPLE_FIELDS } from '../../shared/constants';
import { simplifyField } from '../../shared/descriptions';
import { checkResponse } from '../../shared/errors';
import { requireIpAddress, simplifyTo } from '../../shared/hooks';

const showForGet = { resource: ['ipAddress'], operation: ['get'] };

/**
 * IP Address > Get: GET /api/ip/{ip}, HProxy's free IP lookup. It needs no API key, and the
 * credential is never shown for this resource (KEYED_RESOURCES in shared/constants.ts).
 */
export const ipAddressDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['ipAddress'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get an IP address',
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
		default: 'get',
	},
	{
		displayName: 'IP Address',
		name: 'ip',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. 8.8.8.8',
		description: 'A public IPv4 or IPv6 address',
		displayOptions: { show: showForGet },
	},
	simplifyField(showForGet),
];

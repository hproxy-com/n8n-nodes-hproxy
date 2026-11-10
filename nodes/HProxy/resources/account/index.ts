import type { INodeProperties } from 'n8n-workflow';
import { planLocator } from '../../shared/descriptions';
import { checkResponse } from '../../shared/errors';
import { dropEmptyFields, requireApiKey } from '../../shared/hooks';

const showForAccount = (operation: string[]) => ({ resource: ['account'], operation });

/** Account > Get Balance and Get Bandwidth History: GET /api/v1/wallet and /api/v1/usage. */
export const accountDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get Balance',
				value: 'getBalance',
				action: 'Get the account balance',
				description: 'Get the wallet balance of your account, in cents',
				routing: {
					request: { method: 'GET', url: '/api/v1/wallet' },
					send: { preSend: [requireApiKey] },
					output: { postReceive: [checkResponse] },
				},
			},
			{
				name: 'Get Bandwidth History',
				value: 'getBandwidthHistory',
				action: 'Get the bandwidth history of the account',
				description: 'Get the traffic your plans used, day by day and plan by plan',
				routing: {
					request: { method: 'GET', url: '/api/v1/usage' },
					send: { preSend: [requireApiKey, dropEmptyFields] },
					output: { postReceive: [checkResponse] },
				},
			},
		],
		default: 'getBalance',
	},
	{
		displayName: 'Days',
		name: 'days',
		type: 'number',
		default: 30,
		typeOptions: { minValue: 1, maxValue: 365, numberPrecision: 0 },
		description: 'The last days to include, today counted, from 1 to 365',
		displayOptions: { show: showForAccount(['getBandwidthHistory']) },
		routing: { send: { type: 'query', property: 'days' } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showForAccount(['getBandwidthHistory']) },
		options: [
			{
				...planLocator({ required: false, description: 'Only count the traffic of this plan' }),
				routing: { send: { type: 'query', property: 'plan_id' } },
			},
		],
	},
];

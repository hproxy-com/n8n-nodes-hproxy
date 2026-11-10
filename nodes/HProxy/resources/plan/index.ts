import type { INodeProperties } from 'n8n-workflow';
import { planLocator } from '../../shared/descriptions';
import { checkResponse } from '../../shared/errors';
import { listToItems, requireApiKey, requirePlanId } from '../../shared/hooks';

const showForPlan = (operation: string[]) => ({ resource: ['plan'], operation });

/** Plan > Get, Get Many, Get Traffic: GET /api/v1/plans, /plans/{id} and /plans/{id}/stats. */
export const planDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['plan'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a plan',
				description: 'Get one plan with its traffic left, read live from the network',
				routing: {
					request: { method: 'GET', url: '=/api/v1/plans/{{$parameter.planId}}' },
					send: { preSend: [requireApiKey, requirePlanId] },
					output: { postReceive: [checkResponse] },
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many plans',
				description: 'Get the plans on your account',
				routing: {
					request: { method: 'GET', url: '/api/v1/plans' },
					send: { preSend: [requireApiKey] },
					output: {
						postReceive: [checkResponse, listToItems('plans')],
					},
				},
			},
			{
				name: 'Get Traffic',
				value: 'getTraffic',
				action: 'Get traffic of a plan',
				description:
					'Get the bytes, requests and success rate of a Residential Premium plan over time',
				routing: {
					request: { method: 'GET', url: '=/api/v1/plans/{{$parameter.planId}}/stats' },
					send: { preSend: [requireApiKey, requirePlanId] },
					output: { postReceive: [checkResponse] },
				},
			},
		],
		default: 'getAll',
	},
	{
		...planLocator({ required: true, description: 'The plan to read' }),
		displayOptions: { show: showForPlan(['get', 'getTraffic']) },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: showForPlan(['getAll']) },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { ...showForPlan(['getAll']), returnAll: [false] } },
		routing: { output: { maxResults: '={{$value}}' } },
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		options: [
			{
				name: 'Active',
				value: 'active',
				description: 'The plans that can be used now',
			},
			{
				name: 'All',
				value: 'all',
				description: 'Also the plans whose traffic ran out or that were switched off',
			},
		],
		default: 'active',
		description: 'Which plans to return',
		displayOptions: { show: showForPlan(['getAll']) },
		routing: { send: { type: 'query', property: 'status' } },
	},
	{
		displayName: 'Days',
		name: 'days',
		type: 'number',
		default: 7,
		typeOptions: { minValue: 1, maxValue: 30, numberPrecision: 0 },
		description: 'The window ending now, from 1 to 30 days',
		displayOptions: { show: showForPlan(['getTraffic']) },
		routing: { send: { type: 'query', property: 'days' } },
	},
	{
		displayName: 'Granularity',
		name: 'granularity',
		type: 'options',
		options: [
			{
				name: 'Automatic',
				value: 'auto',
				description: 'Hourly for up to 2 days, daily beyond',
			},
			{
				name: 'Day',
				value: 'day',
				routing: { request: { qs: { granularity: 'day' } } },
			},
			{
				name: 'Hour',
				value: 'hour',
				description: 'For windows of up to 29 days',
				routing: { request: { qs: { granularity: 'hour' } } },
			},
		],
		default: 'auto',
		description: 'The size of each point in the answer',
		displayOptions: { show: showForPlan(['getTraffic']) },
	},
];

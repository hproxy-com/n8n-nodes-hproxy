import type { INodeProperties } from 'n8n-workflow';
import { SIMPLE_FIELDS } from '../../shared/constants';
import { simplifyField } from '../../shared/descriptions';
import { checkResponse } from '../../shared/errors';
import {
	dropEmptyFields,
	linesToItems,
	listToItems,
	prepareFreeProxyQuery,
	prepareGenerateBody,
	prepareProxyCheckBody,
	requireApiKey,
	requirePlanId,
	simplifyTo,
} from '../../shared/hooks';
import { checkFields } from './check';
import { generateFields } from './generate';
import { getManyFields } from './getMany';

/**
 * Proxy > Check: POST /api/proxy-check, HProxy's free proxy checker. No key.
 * Proxy > Generate: POST /api/v1/plans/{id}/generate. HProxy answers with ready-made lines
 * (host:port:username:password) and the node hands each one on as it came, one item per line.
 * Proxy > Get Many: GET /api/proxy-list, HProxy's free proxy list. No key.
 * The credential shows for Generate only (KEYLESS_OPERATIONS in shared/constants.ts).
 */
export const proxyDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['proxy'] } },
		options: [
			{
				name: 'Check',
				value: 'check',
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
				name: 'Generate',
				value: 'generate',
				action: 'Generate proxy lines',
				description: 'Create ready-to-use proxy lines from one of your plans',
				routing: {
					request: {
						method: 'POST',
						url: '=/api/v1/plans/{{$parameter.planId}}/generate',
					},
					send: {
						preSend: [requireApiKey, requirePlanId, prepareGenerateBody, dropEmptyFields],
					},
					output: {
						postReceive: [checkResponse, linesToItems],
					},
				},
			},
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many free proxies',
				description: 'Get working public proxies from the free proxy list, free without a key',
				routing: {
					request: { method: 'GET', url: '/api/proxy-list' },
					send: { preSend: [prepareFreeProxyQuery] },
					output: {
						postReceive: [checkResponse, listToItems(), simplifyTo(SIMPLE_FIELDS.freeProxy)],
					},
				},
			},
		],
		default: 'generate',
	},
	...checkFields,
	...generateFields,
	...getManyFields,
	simplifyField({ resource: ['proxy'], operation: ['check', 'getMany'] }),
];

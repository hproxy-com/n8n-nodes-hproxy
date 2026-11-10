import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { searchPlans } from './listSearch/searchPlans';
import { accountDescription } from './resources/account';
import { freeToolDescription } from './resources/freeTool';
import { planDescription } from './resources/plan';
import { proxyDescription } from './resources/proxy';
import { CREDENTIAL_TYPE, HPROXY_ORIGIN, KEYED_RESOURCES } from './shared/constants';

export class HProxy implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HProxy',
		name: 'hProxy',
		icon: { light: 'file:../../icons/hproxy.svg', dark: 'file:../../icons/hproxy.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Generate residential proxy lines, read plans, traffic and balance, and use the free proxy list, IP lookup and proxy checker',
		defaults: {
			name: 'HProxy',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				// Shown for the keyed resources only. Not marked required, because n8n would then
				// refuse the free tools, which run without a key: requireApiKey (shared/hooks.ts)
				// asks for the key on the keyed operations instead.
				name: CREDENTIAL_TYPE,
				displayOptions: { show: { resource: KEYED_RESOURCES } },
			},
		],
		requestDefaults: {
			baseURL: HPROXY_ORIGIN,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
			// HProxy's refusals carry their reason in the body: shared/errors.ts reads it.
			ignoreHttpStatusErrors: true,
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Account',
						value: 'account',
					},
					{
						name: 'Free Tool',
						value: 'freeTool',
					},
					{
						name: 'Plan',
						value: 'plan',
					},
					{
						name: 'Proxy',
						value: 'proxy',
					},
				],
				default: 'proxy',
			},
			...accountDescription,
			...freeToolDescription,
			...planDescription,
			...proxyDescription,
		],
	};

	methods = {
		listSearch: {
			searchPlans,
		},
	};
}

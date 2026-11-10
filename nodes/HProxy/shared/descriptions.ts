import type { INodeProperties } from 'n8n-workflow';

/**
 * Picks one of the account's plans from a list (listSearch/searchPlans.ts), or takes its ID.
 * Required on the plan operations, optional as a filter inside a collection.
 */
export function planLocator(options: { required: boolean; description: string }): INodeProperties {
	return {
		displayName: 'Plan',
		name: 'planId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		...(options.required ? { required: true } : {}),
		description: options.description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a plan...',
				typeOptions: {
					searchListMethod: 'searchPlans',
					searchable: true,
				},
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. cmjfmhhpd004c4i4hqsk3mzrr',
				validation: [
					{
						type: 'regex',
						properties: {
							regex: '^[A-Za-z0-9_-]{1,64}$',
							errorMessage: 'A plan ID holds only letters, digits, dashes and underscores',
						},
					},
				],
			},
		],
	};
}

/** The "Simplify" switch n8n's UX guidelines ask for when an answer has more than ten fields. */
export function simplifyField(show: { resource: string[]; operation: string[] }): INodeProperties {
	return {
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show },
	};
}

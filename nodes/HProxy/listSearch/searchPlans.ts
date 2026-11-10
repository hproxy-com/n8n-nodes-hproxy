import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import { formatGb, productName } from '../shared/parse';
import { hproxyApiRequest } from '../shared/transport';

const STATUS_WORDS: Record<string, string> = {
	used_up: 'used up',
	inactive: 'switched off',
};

/** One plan as the list shows it, for example "Residential Premium, 3.2 of 10 GB left (customer-1042)". */
export function planListItem(plan: IDataObject): INodeListSearchItems {
	const parts = [productName(plan.productId ?? plan.product)];
	if (typeof plan.dataGbTotal === 'number') {
		parts.push(`${formatGb(plan.dataGbRemaining)} of ${formatGb(plan.dataGbTotal)} GB left`);
	}
	const status = typeof plan.status === 'string' ? STATUS_WORDS[plan.status] : undefined;
	if (status) {
		parts.push(status);
	}
	const label =
		typeof plan.label === 'string' && plan.label.trim() ? ` (${plan.label.trim()})` : '';
	return { name: `${parts.join(', ')}${label}`, value: String(plan.id ?? '') };
}

/** The plans of the account behind the API key. Generating lines lists only the active ones. */
export async function searchPlans(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const resource = this.getCurrentNodeParameter('resource');
	const body = await hproxyApiRequest.call(this, 'GET', '/api/v1/plans', {
		status: resource === 'proxy' ? 'active' : 'all',
	});
	const plans = Array.isArray(body.plans) ? (body.plans as IDataObject[]) : [];
	const needle = (filter ?? '').trim().toLowerCase();

	const results = plans
		.map(planListItem)
		.filter((item) => item.value !== '')
		.filter(
			(item) =>
				needle === '' ||
				item.name.toLowerCase().includes(needle) ||
				String(item.value).toLowerCase().includes(needle),
		);
	return { results };
}

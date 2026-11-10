import { NodeApiError } from 'n8n-workflow';
import type {
	IExecuteSingleFunctions,
	IN8nHttpFullResponse,
	INode,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { retryAfterSeconds } from './parse';

/*
 * Every request of this node is sent with ignoreHttpStatusErrors, so a refusal reaches
 * checkResponse with HProxy's own body intact: { error, code, requestId }. That body says
 * what happened in words a person can act on, which n8n's generic status texts cannot.
 */

/** Why an operation failed, in the shape n8n reads from NodeApiError (n8n 3.x and later). */
type Failure =
	| { cause: 'rate-limited' | 'temporarily-unavailable'; retryAfterMs?: number }
	| { cause: 'credential-invalid' };

export interface Refusal {
	/** What happened, shown as the title of the message in n8n. */
	message: string;
	/** How to get going again, shown under it. */
	description: string;
	/** Only set when the response proves the cause. */
	failure?: Failure;
}

interface HProxyRefusalBody {
	text?: string;
	code?: string;
	requestId?: string;
}

function readBody(body: unknown): HProxyRefusalBody {
	if (body && typeof body === 'object' && !Array.isArray(body)) {
		const fields = body as Record<string, unknown>;
		return {
			text:
				typeof fields.error === 'string' && fields.error.trim() ? fields.error.trim() : undefined,
			code: typeof fields.code === 'string' ? fields.code : undefined,
			requestId: typeof fields.requestId === 'string' ? fields.requestId : undefined,
		};
	}
	// A plain-text answer is kept when it is short and not an HTML page from a proxy in between.
	if (typeof body === 'string') {
		const text = body.trim();
		if (text && text.length <= 300 && !text.startsWith('<')) {
			return { text };
		}
	}
	return {};
}

const withPeriod = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
const withoutPeriod = (text: string) => text.replace(/\.$/, '');

/** Turns an HTTP refusal from HProxy into the two sentences n8n shows. */
export function describeRefusal(statusCode: number, body: unknown, headers?: unknown): Refusal {
	const { text, code, requestId } = readBody(body);
	const hproxySays = text ? ` HProxy says: ${withPeriod(text)}` : '';
	const reference = requestId ? ` Request ID for support: ${requestId}.` : '';

	if (statusCode === 401) {
		return {
			message: 'HProxy did not accept the API key',
			description: `Open the HProxy credential and paste a current key from your HProxy dashboard, under Settings > API keys. Keys start with hpx_.${reference}`,
			failure: { cause: 'credential-invalid' },
		};
	}

	if (statusCode === 403 && code === 'missing_scope') {
		return {
			message: 'This API key lacks the permission this operation needs',
			description: `Create a key with "Read plans" in your HProxy dashboard, under Settings > API keys. Get Balance also needs "Place orders".${hproxySays}${reference}`,
		};
	}

	if (statusCode === 404) {
		return {
			message: 'HProxy found no plan with this ID on your account',
			description: `Pick the plan from the list, or check the ID. To generate lines, the plan must also be active with traffic left.${reference}`,
		};
	}

	if (statusCode === 429) {
		const seconds = retryAfterSeconds(headers);
		return {
			message: 'HProxy asked to slow down',
			description: `${seconds === undefined ? 'Wait a moment' : `Wait ${seconds} seconds`} before the next run, or spread the runs out.${hproxySays}${reference}`,
			failure:
				seconds === undefined
					? { cause: 'rate-limited' }
					: { cause: 'rate-limited', retryAfterMs: seconds * 1000 },
		};
	}

	if (statusCode >= 500) {
		return {
			message: 'HProxy could not answer right now',
			description: `Try again in a minute.${hproxySays}${reference}`,
			failure: { cause: 'temporarily-unavailable' },
		};
	}

	// 400, 402, 403 and the rest: HProxy's own sentence names the field and the rule.
	return {
		message: text ? withoutPeriod(text) : `HProxy refused the request (HTTP ${statusCode})`,
		description: `Check the fields of this node and run it again.${reference}`,
	};
}

/** The body as a JSON object for NodeApiError, which keeps it under the message details. */
function asJsonObject(body: unknown): JsonObject {
	if (body && typeof body === 'object' && !Array.isArray(body)) {
		return body as JsonObject;
	}
	return { body: typeof body === 'string' ? body.slice(0, 300) : null };
}

/** The NodeApiError for a refused HProxy answer, used by the operations and the plan list alike. */
export function refusalError(
	node: INode,
	response: IN8nHttpFullResponse,
	itemIndex?: number,
): NodeApiError {
	const refusal = describeRefusal(response.statusCode, response.body, response.headers);
	return new NodeApiError(node, asJsonObject(response.body), {
		message: refusal.message,
		description: refusal.description,
		httpCode: String(response.statusCode),
		...(itemIndex === undefined ? {} : { itemIndex }),
		...(refusal.failure ? { failure: refusal.failure } : {}),
	});
}

/** True for a 2xx answer. */
export const isSuccess = (response: IN8nHttpFullResponse) =>
	response.statusCode >= 200 && response.statusCode < 300;

/** First postReceive of every operation: passes a 2xx answer on, turns anything else into a NodeApiError. */
export async function checkResponse(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (isSuccess(response)) {
		return items;
	}
	throw refusalError(this.getNode(), response, this.getItemIndex());
}

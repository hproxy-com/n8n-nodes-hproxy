import type {
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
} from 'n8n-workflow';
import { CREDENTIAL_TYPE, HPROXY_ORIGIN } from './constants';
import { isSuccess, refusalError } from './errors';

/**
 * A keyed call to HProxy's API outside the routing blocks: the plan list the editor shows.
 * n8n adds the key from the credential (httpRequestWithAuthentication), and a refusal is
 * described the same way as in the operations (shared/errors.ts).
 */
export async function hproxyApiRequest(
	this: ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	path: string,
	qs: IDataObject = {},
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		baseURL: HPROXY_ORIGIN,
		url: path,
		qs,
		headers: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		CREDENTIAL_TYPE,
		options,
	)) as IN8nHttpFullResponse;

	if (!isSuccess(response)) {
		throw refusalError(this.getNode(), response);
	}
	const body = response.body;
	return body && typeof body === 'object' && !Array.isArray(body) ? (body as IDataObject) : {};
}

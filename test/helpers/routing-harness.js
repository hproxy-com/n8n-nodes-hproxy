'use strict';

/*
 * Runs one input item of the compiled HProxy node the way n8n runs a declarative node, without
 * an n8n server and without the network.
 *
 * - Parameter defaults, display rules and every expression ({{$parameter.planId}}, {{$value}})
 *   go through n8n-workflow itself: the same library n8n uses at run time.
 * - The routing walk (requestDefaults, routing.request / send / output, collections, options,
 *   preSend, postReceive, maxResults) replays n8n's RoutingNode step for step:
 *   https://github.com/n8n-io/n8n/blob/master/packages/core/src/execution-engine/routing-node.ts
 *   (runNode, getRequestOptionsFromParameters, mergeOptions, makeRequest,
 *   postProcessResponseData, runPostReceiveAction, prepareCredentials).
 * - The HTTP layer is a function the test hands in. It receives the final request (method, full
 *   URL, query, headers with the credential applied, body) and returns { statusCode, headers, body }.
 */

const path = require('node:path');
const get = require('lodash/get');
const merge = require('lodash/merge');
const set = require('lodash/set');
const { NodeHelpers, NodeOperationError, Workflow } = require('n8n-workflow');

const DIST = path.join(__dirname, '..', '..', 'dist');
const { HProxy } = require(path.join(DIST, 'nodes', 'HProxy', 'HProxy.node.js'));
const { HProxyApi } = require(path.join(DIST, 'credentials', 'HProxyApi.credentials.js'));

const NODE_TYPE_NAME = '@hproxy/n8n-nodes-hproxy.hProxy';

const isResourceLocator = (value) =>
	value !== null && typeof value === 'object' && value.__rl === true && 'value' in value;

const isExpression = (value) => typeof value === 'string' && value.charAt(0) === '=';

class RoutingHarness {
	constructor() {
		this.nodeType = new HProxy();
		this.credentialType = new HProxyApi();
		this.nodeTypes = {
			getByName: () => this.nodeType,
			getByNameAndVersion: () => this.nodeType,
			getKnownTypes: () => ({}),
		};
	}

	/**
	 * @param {object} options
	 * @param {object} options.parameters  node parameters as a user would set them
	 * @param {object} [options.credentials]  decrypted credential data, for example { apiKey: 'hpx_test' }
	 * @param {(request: object) => Promise<object>|object} options.transport  answers the request
	 * @param {object} [options.input]  the json of the input item
	 * @returns {Promise<{ requests: object[], items?: object[], error?: Error }>}
	 */
	async run({ parameters, credentials, transport, input = {} }) {
		const node = {
			id: 'hproxy-test-node',
			name: 'HProxy',
			type: NODE_TYPE_NAME,
			typeVersion: 1,
			position: [0, 0],
			parameters: structuredClone(parameters),
			...(credentials
				? { credentials: { hProxyApi: { id: 'test', name: 'HProxy test key' } } }
				: {}),
		};
		// The Workflow constructor fills in parameter defaults, as n8n does before running a node.
		const workflow = new Workflow({
			id: 'hproxy-test-workflow',
			nodes: [node],
			connections: {},
			active: false,
			nodeTypes: this.nodeTypes,
		});
		const itemIndex = 0;
		const runIndex = 0;
		const connectionInputData = [{ json: input }];
		const requests = [];

		const evaluate = (value, additionalKeys = {}, returnObjectAsString = false) => {
			if (typeof value === 'object' || isExpression(value)) {
				return workflow.expression.getParameterValue(
					value,
					null,
					runIndex,
					itemIndex,
					node.name,
					connectionInputData,
					'manual',
					additionalKeys,
					undefined,
					returnObjectAsString,
				);
			}
			return value;
		};

		const description = this.nodeType.description;
		const credentialDescription = description.credentials[0];

		// ExecuteSingleContext.getCredentials (node-execution-context.ts, _getCredentials)
		const getCredentials = async (type) => {
			if (type !== credentialDescription.name) {
				throw new NodeOperationError(
					node,
					`Node type "${node.type}" does not have any credentials of type "${type}" defined`,
				);
			}
			if (
				!NodeHelpers.displayParameter(
					node.parameters,
					credentialDescription,
					node,
					description,
					node.parameters,
				)
			) {
				throw new NodeOperationError(node, 'Credentials not found');
			}
			if (!node.credentials || !node.credentials[type]) {
				if (credentialDescription.required === true) {
					throw new NodeOperationError(
						node,
						`Node does not have any credentials set for "${type}"`,
					);
				}
				throw new NodeOperationError(node, 'Node does not require credentials');
			}
			return credentials;
		};

		// ExecuteSingleContext.getNodeParameter for one item
		const getNodeParameter = (parameterPath, fallbackValue, options = {}) => {
			let value = get(node.parameters, parameterPath);
			if (value === undefined) {
				return fallbackValue;
			}
			value = evaluate(value);
			if (options.extractValue && isResourceLocator(value)) {
				value = evaluate(value.value);
			}
			return value;
		};

		const thisArgs = {
			getNode: () => node,
			getNodeParameter,
			getCredentials,
			getItemIndex: () => itemIndex,
			getExecuteData: () => undefined,
			continueOnFail: () => false,
			helpers: {},
		};

		// RoutingNode.prepareCredentials
		let credentialData;
		let credentialName = credentialDescription.name;
		try {
			credentialData = await getCredentials(credentialName);
		} catch (error) {
			if (credentialDescription.required) {
				return { requests, error };
			}
			credentialName = undefined;
		}

		const requestData = {
			options: { qs: {}, body: {}, headers: {} },
			preSend: [],
			postReceive: [],
			requestOperations: {},
		};
		const baseKeys = { $credentials: credentialData, $version: node.typeVersion };

		try {
			for (const key of Object.keys(description.requestDefaults || {})) {
				requestData.options[key] = evaluate(description.requestDefaults[key], baseKeys);
			}

			for (const property of description.properties) {
				const value = evaluate(get(node.parameters, property.name, []), baseKeys);
				const options = this.requestOptionsFromParameter(thisArgs, node, evaluate, property, '', {
					...baseKeys,
					$value: value,
				});
				mergeOptions(requestData, options);
			}
			requestData.options.timeout = requestData.options.timeout || 300000;

			for (const preSend of requestData.preSend) {
				requestData.options = await preSend.call(thisArgs, requestData.options);
			}

			// RoutingNode.rawRoutingRequest: the response always comes back in full
			requestData.options.returnFullResponse = true;
			const request = this.toRequest(
				requestData.options,
				credentialName ? credentialData : undefined,
				evaluate,
			);
			requests.push(request);
			const response = normalizeResponse(await transport(request));
			if (
				!request.ignoreHttpStatusErrors &&
				(response.statusCode < 200 || response.statusCode >= 300)
			) {
				throw Object.assign(new Error(`Request failed with status code ${response.statusCode}`), {
					httpCode: String(response.statusCode),
				});
			}

			let items = await postProcess(thisArgs, evaluate, requestData, response, itemIndex);
			if (requestData.maxResults) {
				items.splice(Number(requestData.maxResults));
			}
			items = items.map((item) => ({
				...item,
				pairedItem: item.pairedItem ?? { item: itemIndex },
			}));
			return { requests, items };
		} catch (error) {
			return { requests, error };
		}
	}

	// RoutingNode.getRequestOptionsFromParameters
	requestOptionsFromParameter(
		thisArgs,
		node,
		evaluate,
		nodeProperties,
		pathPrefix,
		additionalKeys,
	) {
		const description = this.nodeType.description;
		const result = {
			options: { qs: {}, body: {}, headers: {} },
			preSend: [],
			postReceive: [],
			requestOperations: {},
		};
		let basePath = pathPrefix ? `${pathPrefix}.` : '';

		if (
			!NodeHelpers.displayParameter(
				node.parameters,
				nodeProperties,
				node,
				description,
				node.parameters,
			)
		) {
			return undefined;
		}

		if (nodeProperties.routing) {
			let parameterValue;
			if ('type' in nodeProperties) {
				const extract =
					nodeProperties.extractValue !== undefined || nodeProperties.type === 'resourceLocator';
				parameterValue = thisArgs.getNodeParameter(basePath + nodeProperties.name, undefined, {
					extractValue: extract,
				});
			}
			const keys = { ...additionalKeys, $value: parameterValue };
			const routing = nodeProperties.routing;

			if (routing.operations) {
				result.requestOperations = { ...routing.operations };
			}
			if (routing.request) {
				for (const key of Object.keys(routing.request)) {
					result.options[key] = evaluate(routing.request[key], keys);
				}
			}
			if (routing.send) {
				if (routing.send.property !== undefined) {
					const propertyName = evaluate(routing.send.property, keys, true);
					let value = parameterValue;
					if (routing.send.value) {
						value = evaluate(routing.send.value, { ...additionalKeys, $value: value });
					}
					const target = routing.send.type === 'body' ? result.options.body : result.options.qs;
					if (routing.send.propertyInDotNotation === false) {
						target[propertyName] = value;
					} else {
						set(target, propertyName, value);
					}
				}
				if (routing.send.paginate !== undefined) {
					result.paginate = !!evaluate(routing.send.paginate, keys, true);
				}
				if (routing.send.preSend) {
					result.preSend.push(...routing.send.preSend);
				}
			}
			if (routing.output) {
				if (routing.output.maxResults !== undefined) {
					result.maxResults = evaluate(routing.output.maxResults, keys, true);
				}
				if (routing.output.postReceive) {
					const actions = routing.output.postReceive.filter((action) => {
						if (typeof action === 'function') return true;
						if (isExpression(action.enabled)) return evaluate(action.enabled, keys, true);
						return action.enabled !== false;
					});
					if (actions.length) {
						result.postReceive.push({ data: { parameterValue }, actions });
					}
				}
			}
		}

		if (!Object.prototype.hasOwnProperty.call(nodeProperties, 'options')) {
			return result;
		}

		if (nodeProperties.type === 'options') {
			const optionValue = NodeHelpers.getParameterValueByPath(
				node.parameters,
				nodeProperties.name,
				basePath.slice(0, -1),
			);
			const selected = nodeProperties.options.filter((option) => option.value === optionValue);
			if (selected.length) {
				mergeOptions(
					result,
					this.requestOptionsFromParameter(
						thisArgs,
						node,
						evaluate,
						selected[0],
						`${basePath}${nodeProperties.name}`,
						{
							...additionalKeys,
							$value: optionValue,
							$version: node.typeVersion,
						},
					),
				);
			}
		} else if (nodeProperties.type === 'collection') {
			const value = NodeHelpers.getParameterValueByPath(
				node.parameters,
				nodeProperties.name,
				basePath.slice(0, -1),
			);
			for (const option of nodeProperties.options) {
				if (Object.keys(value || {}).includes(option.name) && option.type !== undefined) {
					mergeOptions(
						result,
						this.requestOptionsFromParameter(
							thisArgs,
							node,
							evaluate,
							option,
							`${basePath}${nodeProperties.name}`,
							{
								...additionalKeys,
								$version: node.typeVersion,
							},
						),
					);
				}
			}
		} else if (nodeProperties.type === 'fixedCollection') {
			throw new Error(
				'fixedCollection routing is not replayed by this harness: the node uses none',
			);
		}
		return result;
	}

	/** The request as the server would see it: credential applied the way n8n's generic auth does. */
	toRequest(options, credentialData, evaluate) {
		const headers = { ...(options.headers || {}) };
		const qs = { ...(options.qs || {}) };
		if (credentialData) {
			const auth = this.credentialType.authenticate.properties;
			for (const [name, value] of Object.entries(auth.headers || {})) {
				headers[name] = evaluate(value, { $credentials: credentialData });
			}
			for (const [name, value] of Object.entries(auth.qs || {})) {
				qs[name] = evaluate(value, { $credentials: credentialData });
			}
		}
		const url = new URL(options.url || '', options.baseURL);
		for (const [name, value] of Object.entries(qs)) {
			if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
		}
		const method = (options.method || 'GET').toUpperCase();
		// n8n's request helper sends no body on GET; on POST it sends the JSON object
		const hasBody = method !== 'GET' && method !== 'HEAD' && options.body !== undefined;
		return {
			method,
			url: url.toString(),
			path: url.pathname,
			query: Object.fromEntries(url.searchParams.entries()),
			headers,
			body: hasBody ? structuredClone(options.body) : undefined,
			ignoreHttpStatusErrors: options.ignoreHttpStatusErrors,
			timeout: options.timeout,
		};
	}
}

// RoutingNode.mergeOptions
function mergeOptions(destination, source) {
	if (!source) return;
	destination.paginate = destination.paginate ?? source.paginate;
	destination.maxResults = source.maxResults ? source.maxResults : destination.maxResults;
	merge(destination.options, source.options);
	destination.preSend.push(...source.preSend);
	destination.postReceive.push(...source.postReceive);
	if (source.requestOperations && destination.requestOperations) {
		destination.requestOperations = Object.assign(
			destination.requestOperations,
			source.requestOperations,
		);
	}
}

function normalizeResponse(response) {
	return {
		statusCode: response.statusCode ?? 200,
		headers: response.headers ?? {},
		body: response.body ?? null,
	};
}

// RoutingNode.postProcessResponseData and runPostReceiveAction
async function postProcess(thisArgs, evaluate, requestData, response, itemIndex) {
	let items = [{ json: response.body }];
	if (!requestData.postReceive.length) {
		return Array.isArray(response.body) ? response.body.map((json) => ({ json })) : items;
	}
	for (const step of requestData.postReceive) {
		for (const action of step.actions) {
			if (typeof action === 'function') {
				items = await action.call(thisArgs, items, response);
			} else if (action.type === 'rootProperty') {
				items = items.flatMap((item) => {
					let content = get(item.json, action.properties.property);
					if (!Array.isArray(content)) content = [content];
					return content.map((json) => ({ json }));
				});
			} else if (action.type === 'limit') {
				const max = evaluate(action.properties.maxResults, {
					$response: response,
					$value: step.data.parameterValue,
				});
				items = items.slice(0, parseInt(max, 10));
			} else {
				throw new Error(
					`postReceive type "${action.type}" is not replayed by this harness: the node uses none`,
				);
			}
		}
	}
	return items.map((item) => ({ ...item, pairedItem: item.pairedItem ?? { item: itemIndex } }));
}

module.exports = { RoutingHarness, NODE_TYPE_NAME };

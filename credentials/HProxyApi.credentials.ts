import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class HProxyApi implements ICredentialType {
	name = 'hProxyApi';

	displayName = 'HProxy API';

	icon: Icon = { light: 'file:../icons/hproxy.svg', dark: 'file:../icons/hproxy.dark.svg' };

	documentationUrl = 'https://hproxy.com/docs/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Your key from the HProxy dashboard, under Settings > API keys. It starts with hpx_. A key with "Read plans" covers every operation except Get Balance, which also needs "Place orders".',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://hproxy.com',
			url: '/api/v1/me',
			method: 'GET',
		},
	};
}

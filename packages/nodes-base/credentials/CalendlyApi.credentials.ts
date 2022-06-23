import {
	IAuthenticateHeaderAuth,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CalendlyApi implements ICredentialType {
	name = 'calendlyApi';
	displayName = 'Calendly API';
	documentationUrl = 'calendly';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			default: '',
		},
	];
	authenticate: IAuthenticateHeaderAuth = {
		type: 'headerAuth',
		properties: {
			name: 'X-TOKEN',
			value: '={{$credentials?.apiKey}}',
		},
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://calendly.com/api/v1',
			url: '/users/me',
		},
	};
}

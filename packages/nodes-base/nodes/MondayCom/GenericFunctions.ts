import {
	OptionsWithUri,
 } from 'request';

import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
} from 'n8n-core';

import {
	IDataObject,
	IHookFunctions,
	IWebhookFunctions,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

import {
	get,
} from 'lodash';

export async function mondayComApiRequest(this: IExecuteFunctions | IWebhookFunctions | IHookFunctions | ILoadOptionsFunctions, body: any = {}, option: IDataObject = {}): Promise<any> { // tslint:disable-line:no-any

	const credentials = this.getCredentials('mondayComApi');

	if (credentials === undefined) {
		throw new NodeOperationError(this.getNode(), 'No credentials got returned!');
	}

	const endpoint = 'https://api.monday.com/v2/';

	let options: OptionsWithUri = {
		headers: {
			'Content-Type': 'application/json',
			'Authorization': credentials.apiToken,
		},
		method: 'POST',
		body,
		uri: endpoint,
		json: true,
	};
	options = Object.assign({}, options, option);
	try {
		return await this.helpers.request!(options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error);
	}
}

export async function mondayComApiRequestAllItems(this: IHookFunctions | IExecuteFunctions | ILoadOptionsFunctions, propertyName: string, body: any = {}): Promise<any> { // tslint:disable-line:no-any

	const returnData: IDataObject[] = [];

	let responseData;
	body.variables.limit = 50;
	body.variables.page = 1;

	do {
		responseData = await mondayComApiRequest.call(this, body);
		returnData.push.apply(returnData, get(responseData, propertyName));
		body.variables.page++;
	} while (
		get(responseData, propertyName).length > 0
	);
	return returnData;
}

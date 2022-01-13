import { INodeProperties } from 'n8n-workflow';

export const ticketDescription: INodeProperties[] = [
	{
		displayName: 'Summary:',
		name: 'summary',
		type: 'string',
		default: '',
		description: 'Enter ticket\'s summary',
		placeholder: '',
		displayOptions: {
			show: {
				operation: ['create', 'update'],
				resource: ['ticket'],
			},
		},
	},
	{
		displayName: 'Details:',
		name: 'details',
		type: 'string',
		default: '',
		description: 'Enter ticket\'s details',
		placeholder: '',
		displayOptions: {
			show: {
				operation: ['create', 'update'],
				resource: ['ticket'],
			},
		},
	},
];

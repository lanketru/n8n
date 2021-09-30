import {
	INodeProperties,
} from 'n8n-workflow';

export const issueOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		displayOptions: {
			show: {
				resource: [
					'issue',
				],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get the data for a specific issue',
			},
			{
				name: 'Get Events',
				value: 'getEvents',
				description: 'Get the events for an issue',
			},
		],
		default: 'get',
		description: 'The operation to perform',
		noDataExpression: true,
	},
];

export const issueFields: INodeProperties[] = [

/* -------------------------------------------------------------------------- */
/*                                issue:get                                   */
/* -------------------------------------------------------------------------- */
	{
		displayName: 'Issue Number',
		name: 'issueNumber',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: [
					'issue',
				],
				operation: [
					'get',
				],
			}
		},
		required: true
	},

/* -------------------------------------------------------------------------- */
/*                                issue:getEvents                             */
/* -------------------------------------------------------------------------- */
	{
		displayName: 'Issue Number',
		name: 'issueNumber',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: [
					'issue',
				],
				operation: [
					'getEvents',
				],
			}
		},
		required: true
	},
];

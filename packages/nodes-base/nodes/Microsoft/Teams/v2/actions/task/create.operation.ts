import type { INodeProperties, IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { updateDisplayOptions } from '@utils/utilities';
import { bucketRLC, groupRLC, groupSourceOptions, memberRLC, planRLC } from '../../descriptions';
import { microsoftApiRequest } from '../../transport';

const properties: INodeProperties[] = [
	groupSourceOptions,
	groupRLC,
	planRLC,
	bucketRLC,
	{
		displayName: 'Title',
		name: 'title',
		required: true,
		type: 'string',
		default: '',
		placeholder: '“e.g. new task',
		description: 'Title of the task',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		default: {},
		placeholder: 'Add Option',
		options: [
			{
				...memberRLC,
				displayName: 'Assigned To',
				name: 'assignedTo',
				description: 'Who the task should be assigned to',
				typeOptions: {
					loadOptionsDependsOn: ['groupId.balue'],
				},
			},
			{
				displayName: 'Due Date Time',
				name: 'dueDateTime',
				type: 'dateTime',
				default: '',
				description:
					'Date and time at which the task is due. The Timestamp type represents date and time information using ISO 8601 format and is always in UTC time.”.',
			},
			{
				// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-multi-options
				displayName: 'Labels',
				name: 'labels',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getLabels',
					loadOptionsDependsOn: ['planId.value'],
				},
				default: [],
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-multi-options
				description: 'Labels to assign to the task',
			},
			{
				displayName: 'Percent Complete',
				name: 'percentComplete',
				type: 'number',
				typeOptions: {
					minValue: 0,
					maxValue: 100,
				},
				default: 0,
				placeholder: 'e.g. 75',
				description:
					'Percentage of task completion. When set to 100, the task is considered completed.',
			},
		],
	},
];

const displayOptions = {
	show: {
		resource: ['task'],
		operation: ['create'],
	},
};

export const description = updateDisplayOptions(displayOptions, properties);

export async function execute(this: IExecuteFunctions, i: number) {
	//https://docs.microsoft.com/en-us/graph/api/planner-post-tasks?view=graph-rest-1.0&tabs=http

	const planId = this.getNodeParameter('planId', i, '', { extractValue: true }) as string;
	const bucketId = this.getNodeParameter('bucketId', i, '', { extractValue: true }) as string;

	const title = this.getNodeParameter('title', i) as string;
	const options = this.getNodeParameter('options', i);

	const body: IDataObject = {
		planId,
		bucketId,
		title,
	};

	if (options.assignedTo) {
		options.assignedTo = this.getNodeParameter('options.assignedTo', i, '', {
			extractValue: true,
		}) as string;
	}

	Object.assign(body, options);

	if (body.assignedTo) {
		body.assignments = {
			[body.assignedTo as string]: {
				'@odata.type': 'microsoft.graph.plannerAssignment',
				orderHint: ' !',
			},
		};
		delete body.assignedTo;
	}

	if (Array.isArray(body.labels)) {
		body.appliedCategories = (body.labels as string[]).map((label) => ({
			[label]: true,
		}));
	}

	return microsoftApiRequest.call(this, 'POST', '/v1.0/planner/tasks', body);
}

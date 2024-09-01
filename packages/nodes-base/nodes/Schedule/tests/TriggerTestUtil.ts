import { mock } from 'jest-mock-extended';
import merge from 'lodash/merge';
import { returnJsonArray } from 'n8n-core';
import { ScheduledTaskManager } from 'n8n-core/dist/ScheduledTaskManager';
import type {
	IDataObject,
	INode,
	INodeType,
	ITriggerFunctions,
	ITriggerResponse,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';

type MockDeepPartial<T> = Parameters<typeof mock<T>>[0];

type TestTriggerNodeOptions = {
	node?: MockDeepPartial<INode>;
	timezone?: string;
	workflowStaticData?: IDataObject;
};

type TriggerNodeTypeClass = new () => INodeType & Required<Pick<INodeType, 'trigger'>>;

export const createTestTriggerNode = (Trigger: TriggerNodeTypeClass) => {
	const trigger = new Trigger();

	const emit: jest.MockedFunction<ITriggerFunctions['emit']> = jest.fn();

	const setupTriggerFunctions = (
		mode: WorkflowExecuteMode,
		options: TestTriggerNodeOptions = {},
	) => {
		const timezone = options.timezone ?? 'Europe/Berlin';
		const version = trigger.description.version;
		const node = merge(
			{
				type: trigger.description.name,
				name: trigger.description.defaults.name ?? `Test Node (${trigger.description.name})`,
				typeVersion: typeof version === 'number' ? version : version.at(-1),
			} satisfies Partial<INode>,
			options.node,
		) as INode;
		const workflow = mock<Workflow>({ timezone: options.timezone ?? 'Europe/Berlin' });

		const scheduledTaskManager = new ScheduledTaskManager();
		const helpers = mock<ITriggerFunctions['helpers']>({
			returnJsonArray,
			registerCron: (cronExpression, onTick) =>
				scheduledTaskManager.registerCron(workflow, cronExpression, onTick),
		});

		const triggerFunctions = mock<ITriggerFunctions>({
			helpers,
			emit,
			getTimezone: () => timezone,
			getNode: () => node,
			getMode: () => mode,
			getWorkflowStaticData: () => options.workflowStaticData ?? {},
			getNodeParameter: (parameterName, fallback) => node.parameters[parameterName] ?? fallback,
		});

		return triggerFunctions;
	};

	return {
		test: async (options: TestTriggerNodeOptions = {}) => {
			const triggerFunctions = setupTriggerFunctions('trigger', options);

			const response: ITriggerResponse = await trigger.trigger.call(triggerFunctions);

			expect(response.manualTriggerFunction).toBeUndefined();

			return {
				closeFunction: response.closeFunction,
				manualTriggerFunction: response.manualTriggerFunction,
				mocks: { emit },
			};
		},

		testManual: async (options: TestTriggerNodeOptions = {}) => {
			const triggerFunctions = setupTriggerFunctions('manual', options);

			const response: ITriggerResponse = await trigger.trigger.call(triggerFunctions);

			expect(response.manualTriggerFunction).toBeInstanceOf(Function);

			return {
				closeFunction: response.closeFunction,
				manualTriggerFunction: response.manualTriggerFunction,
				mocks: { emit },
			};
		},
	};
};

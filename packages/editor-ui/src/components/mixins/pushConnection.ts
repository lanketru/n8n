import {
	IExecutionsCurrentSummaryExtended,
	IPushData,
	IPushDataConsoleMessage,
	IPushDataExecutionFinished,
	IPushDataExecutionStarted,
	IPushDataNodeExecuteAfter,
	IPushDataNodeExecuteBefore,
	IPushDataTestWebhook,
} from '../../Interface';

import { externalHooks } from '@/components/mixins/externalHooks';
import { nodeHelpers } from '@/components/mixins/nodeHelpers';
import { showMessage } from '@/components/mixins/showMessage';
import { titleChange } from '@/components/mixins/titleChange';

import mixins from 'vue-typed-mixins';

export const pushConnection = mixins(
	externalHooks,
	nodeHelpers,
	showMessage,
	titleChange,
)
	.extend({
		data () {
			return {
				eventSource: null as EventSource | null,
				reconnectTimeout: null as NodeJS.Timeout | null,
				retryTimeout: null as NodeJS.Timeout | null,
				pushMessageQueue: [] as Array<{ event: Event, retriesLeft: number }>,
			};
		},
		computed: {
			sessionId (): string {
				return this.$store.getters.sessionId;
			},
		},
		methods: {
			pushAutomaticReconnect (): void {
				if (this.reconnectTimeout !== null) {
					return;
				}

				this.reconnectTimeout = setTimeout(() => {
					this.pushConnect();
				}, 3000);
			},

			/**
			 * Connect to server to receive data via EventSource
			 */
			pushConnect (): void {
				// Make sure existing event-source instances get
				// always removed that we do not end up with multiple ones
				this.pushDisconnect();

				const connectionUrl = `${this.$store.getters.getRestUrl}/push?sessionId=${this.sessionId}`;

				this.eventSource = new EventSource(connectionUrl);
				this.eventSource.addEventListener('message', this.pushMessageReceived, false);

				this.eventSource.addEventListener('open', () => {
					this.$store.commit('setPushConnectionActive', true);
					if (this.reconnectTimeout !== null) {
						clearTimeout(this.reconnectTimeout);
						this.reconnectTimeout = null;
					}
				}, false);

				this.eventSource.addEventListener('error', () => {
					this.pushDisconnect();

					if (this.reconnectTimeout !== null) {
						clearTimeout(this.reconnectTimeout);
						this.reconnectTimeout = null;
					}

					this.$store.commit('setPushConnectionActive', false);
					this.pushAutomaticReconnect();
				}, false);
			},

			/**
			 * Close connection to server
			 */
			pushDisconnect (): void {
				if (this.eventSource !== null) {
					this.eventSource.close();
					this.eventSource = null;

					this.$store.commit('setPushConnectionActive', false);
				}
			},

			/**
			 * Sometimes the push message is faster as the result from
			 * the REST API so we do not know yet what execution ID
			 * is currently active. So internally resend the message
			 * a few more times
			 *
			 * @param {Event} event
			 * @param {number} retryAttempts
			 * @returns
			 */
			queuePushMessage (event: Event, retryAttempts: number) {
				this.pushMessageQueue.push({ event, retriesLeft: retryAttempts });

				if (this.retryTimeout === null) {
					this.retryTimeout = setTimeout(this.processWaitingPushMessages, 20);
				}
			},


			/**
			 * Process the push messages which are waiting in the queue
			 */
			processWaitingPushMessages () {
				if (this.retryTimeout !== null) {
					clearTimeout(this.retryTimeout);
					this.retryTimeout = null;
				}

				const queueLength = this.pushMessageQueue.length;
				for (let i = 0; i < queueLength; i++) {
					const messageData = this.pushMessageQueue.shift();

					if (this.pushMessageReceived(messageData!.event, true) === false) {
						// Was not successful
						messageData!.retriesLeft -= 1;

						if (messageData!.retriesLeft > 0) {
							// If still retries are left add it back and stop execution
							this.pushMessageQueue.unshift(messageData!);
						}
						break;
					}
				}

				if (this.pushMessageQueue.length !== 0 && this.retryTimeout === null) {
					this.retryTimeout = setTimeout(this.processWaitingPushMessages, 25);
				}
			},


			/**
			 * Process a newly received message
			 *
			 * @param {Event} event The event data with the message data
			 * @param {boolean} [isRetry] If it is a retry
			 * @returns {boolean} If message could be processed
			 */
			pushMessageReceived (event: Event, isRetry?: boolean): boolean {
				const retryAttempts = 5;
				let receivedData: IPushData;
				try {
					// @ts-ignore
					receivedData = JSON.parse(event.data);
				} catch (error) {
					return false;
				}

				if (receivedData.type === 'sendConsoleMessage') {
					const pushData = receivedData.data;
					console.log(pushData.source, pushData.message); // eslint-disable-line no-console
					return true;
				}

				if (!['testWebhookReceived'].includes(receivedData.type) && isRetry !== true && this.pushMessageQueue.length) {
					// If there are already messages in the queue add the new one that all of them
					// get executed in order
					this.queuePushMessage(event, retryAttempts);
					return false;
				}

				// if (['nodeExecuteAfter', 'nodeExecuteBefore'].includes(receivedData.type)) {
				if (receivedData.type === 'nodeExecuteAfter' || receivedData.type === 'nodeExecuteBefore') {
					if (this.$store.getters.isActionActive('workflowRunning') === false) {
						// No workflow is running so ignore the messages
						return false;
					}
					const pushData = receivedData.data;
					if (this.$store.getters.activeExecutionId !== pushData.executionId) {
						// The data is not for the currently active execution or
						// we do not have the execution id yet.
						if (isRetry !== true) {
							this.queuePushMessage(event, retryAttempts);
						}
						return false;
					}
				}

				if (receivedData.type === 'executionFinished') {
					// The workflow finished executing
					const pushData = receivedData.data;

					this.$store.commit('finishActiveExecution', pushData);

					if (this.$store.getters.isActionActive('workflowRunning') === false) {
						// No workflow is running so ignore the messages
						return false;
					}

					if (this.$store.getters.activeExecutionId !== pushData.executionId) {
						// The workflow which did finish execution did either not get started
						// by this session or we do not have the execution id yet.
						if (isRetry !== true) {
							this.queuePushMessage(event, retryAttempts);
						}
						return false;
					}

					const runDataExecuted = pushData.data;

					let runDataExecutedErrorMessage;
					// @ts-ignore
					const workflow = this.getWorkflow();
					if (runDataExecuted.finished !== true) {
						// There was a problem with executing the workflow
						let errorMessage = 'There was a problem executing the workflow!';

						if (runDataExecuted.data.resultData.error && runDataExecuted.data.resultData.error.message) {
							let nodeName: string | undefined;
							if (runDataExecuted.data.resultData.error.node) {
								nodeName = typeof runDataExecuted.data.resultData.error.node === 'string'
									? runDataExecuted.data.resultData.error.node
									: runDataExecuted.data.resultData.error.node.name;
							}

							const receivedError = nodeName
								? `${nodeName}: ${runDataExecuted.data.resultData.error.message}`
								: runDataExecuted.data.resultData.error.message;
							errorMessage = `There was a problem executing the workflow:<br /><strong>"${receivedError}"</strong>`;
						}

						runDataExecutedErrorMessage = errorMessage;

						this.$titleSet(workflow.name, 'ERROR');
						this.$showMessage({
							title: 'Problem executing workflow',
							message: errorMessage,
							type: 'error',
						});
					} else {
						// Workflow did execute without a problem
						this.$titleSet(workflow.name, 'IDLE');
						this.$showMessage({
							title: 'Workflow got executed',
							message: 'Workflow did get executed successfully!',
							type: 'success',
						});
					}

					// It does not push the runData as it got already pushed with each
					// node that did finish. For that reason copy in here the data
					// which we already have.
					runDataExecuted.data.resultData.runData = this.$store.getters.getWorkflowRunData;

					this.$store.commit('setExecutingNode', null);
					this.$store.commit('setWorkflowExecutionData', runDataExecuted);
					this.$store.commit('removeActiveAction', 'workflowRunning');

					// Set the node execution issues on all the nodes which produced an error so that
					// it can be displayed in the node-view
					this.updateNodesExecutionIssues();

					let itemsCount = 0;
					if(runDataExecuted.data.resultData.lastNodeExecuted && !runDataExecutedErrorMessage) {
						itemsCount = runDataExecuted.data.resultData.runData[runDataExecuted.data.resultData.lastNodeExecuted][0].data!.main[0]!.length;
					}

					this.$externalHooks().run('pushConnection.executionFinished', {
						itemsCount,
						nodeName: runDataExecuted.data.resultData.lastNodeExecuted,
						errorMessage: runDataExecutedErrorMessage,
						runDataExecutedStartData: runDataExecuted.data.startData,
						resultDataError: runDataExecuted.data.resultData.error,
					});

				} else if (receivedData.type === 'executionStarted') {
					const pushData = receivedData.data;

					const executionData: IExecutionsCurrentSummaryExtended = {
						id: pushData.executionId,
						finished: false,
						mode: pushData.mode,
						startedAt: pushData.startedAt,
						retryOf: pushData.retryOf,
						workflowId: pushData.workflowId,
						workflowName: pushData.workflowName,
					};

					this.$store.commit('addActiveExecution', executionData);
				} else if (receivedData.type === 'nodeExecuteAfter') {
					// A node finished to execute. Add its data
					const pushData = receivedData.data;
					this.$store.commit('addNodeExecutionData', pushData);
				} else if (receivedData.type === 'nodeExecuteBefore') {
					// A node started to be executed. Set it as executing.
					const pushData = receivedData.data;
					this.$store.commit('setExecutingNode', pushData.nodeName);
				} else if (receivedData.type === 'testWebhookDeleted') {
					// A test-webhook got deleted
					const pushData = receivedData.data;

					if (pushData.workflowId === this.$store.getters.workflowId) {
						this.$store.commit('setExecutionWaitingForWebhook', false);
						this.$store.commit('removeActiveAction', 'workflowRunning');
					}
				} else if (receivedData.type === 'testWebhookReceived') {
					// A test-webhook did get called
					const pushData = receivedData.data;

					if (pushData.workflowId === this.$store.getters.workflowId) {
						this.$store.commit('setExecutionWaitingForWebhook', false);
						this.$store.commit('setActiveExecutionId', pushData.executionId);
					}

					this.processWaitingPushMessages();
				}
				return true;
			},
		},
	});

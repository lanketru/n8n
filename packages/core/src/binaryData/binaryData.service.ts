import { readFile, stat } from 'fs/promises';
import type { IBinaryData, INodeExecutionData } from 'n8n-workflow';
import prettyBytes from 'pretty-bytes';
import type { Readable } from 'stream';
import { BINARY_ENCODING } from 'n8n-workflow';
import type { BinaryData } from './types';
import { FileSystemClient } from './fs.client';
import { Service } from 'typedi';
import concatStream from 'concat-stream';

@Service()
export class BinaryDataService {
	private availableModes: BinaryData.Mode[] = [];

	private mode: BinaryData.Mode = 'default';

	private clients: Record<string, BinaryData.Client> = {};

	async init(config: BinaryData.Config, mainClient = false) {
		this.availableModes = config.availableModes.split(',') as BinaryData.Mode[]; // @TODO: Remove assertion
		this.mode = config.mode;

		if (this.availableModes.includes('filesystem')) {
			this.clients.filesystem = new FileSystemClient(
				(config as BinaryData.FileSystemConfig).storagePath,
			); // @TODO: Remove assertion
			await this.clients.filesystem.init(mainClient);
		}

		return undefined;
	}

	async copyBinaryFile(binaryData: IBinaryData, path: string, executionId: string) {
		// If a client handles this binary, copy over the binary file and return its reference id.
		const client = this.clients[this.mode];

		if (client) {
			const identifier = await client.copyByPath(path, executionId);
			// Add client reference id.
			binaryData.id = this.createIdentifier(identifier);

			// Prevent preserving data in memory if handled by a client.
			binaryData.data = this.mode;

			const fileSize = await client.getSize(identifier);
			binaryData.fileSize = prettyBytes(fileSize);

			await client.storeMetadata(identifier, {
				fileName: binaryData.fileName,
				mimeType: binaryData.mimeType,
				fileSize,
			});
		} else {
			const { size } = await stat(path);
			binaryData.fileSize = prettyBytes(size);
			binaryData.data = await readFile(path, { encoding: BINARY_ENCODING });
		}

		return binaryData;
	}

	async store(binaryData: IBinaryData, input: Buffer | Readable, executionId: string) {
		// If a client handles this binary, return the binary data with its reference id.
		const client = this.clients[this.mode];
		if (client) {
			const identifier = await client.store(input, executionId);

			// Add client reference id.
			binaryData.id = this.createIdentifier(identifier);

			// Prevent preserving data in memory if handled by a client.
			binaryData.data = this.mode;

			const fileSize = await client.getSize(identifier);
			binaryData.fileSize = prettyBytes(fileSize);

			await client.storeMetadata(identifier, {
				fileName: binaryData.fileName,
				mimeType: binaryData.mimeType,
				fileSize,
			});
		} else {
			const buffer = await this.binaryToBuffer(input);
			binaryData.data = buffer.toString(BINARY_ENCODING);
			binaryData.fileSize = prettyBytes(buffer.length);
		}

		return binaryData;
	}

	async binaryToBuffer(body: Buffer | Readable) {
		return new Promise<Buffer>((resolve) => {
			if (Buffer.isBuffer(body)) resolve(body);
			else body.pipe(concatStream(resolve));
		});
	}

	getAsStream(identifier: string, chunkSize?: number) {
		const { mode, id } = this.splitBinaryModeFileId(identifier);

		if (this.clients[mode]) {
			return this.clients[mode].getAsStream(id, chunkSize);
		}

		throw new Error('Storage mode used to store binary data not available');
	}

	async getBinaryDataBuffer(binaryData: IBinaryData) {
		if (binaryData.id) {
			return this.retrieveBinaryDataByIdentifier(binaryData.id);
		}

		return Buffer.from(binaryData.data, BINARY_ENCODING);
	}

	async retrieveBinaryDataByIdentifier(identifier: string): Promise<Buffer> {
		const { mode, id } = this.splitBinaryModeFileId(identifier);

		if (this.clients[mode]) {
			return this.clients[mode].getAsBuffer(id);
		}

		throw new Error('Storage mode used to store binary data not available');
	}

	getPath(identifier: string) {
		const { mode, id } = this.splitBinaryModeFileId(identifier);

		if (this.clients[mode]) {
			return this.clients[mode].getPath(id);
		}

		throw new Error('Storage mode used to store binary data not available');
	}

	async getMetadata(identifier: string) {
		const { mode, id } = this.splitBinaryModeFileId(identifier);
		if (this.clients[mode]) {
			return this.clients[mode].getMetadata(id);
		}

		throw new Error('Storage mode used to store binary data not available');
	}

	async deleteManyByExecutionIds(executionIds: string[]) {
		const client = this.clients[this.mode];
		if (client) {
			await client.deleteManyByExecutionIds(executionIds);
		}
	}

	async duplicateBinaryData(inputData: Array<INodeExecutionData[] | null>, executionId: string) {
		if (inputData && this.clients[this.mode]) {
			const returnInputData = (inputData as INodeExecutionData[][]).map(
				async (executionDataArray) => {
					if (executionDataArray) {
						return Promise.all(
							executionDataArray.map(async (executionData) => {
								if (executionData.binary) {
									return this.duplicateBinaryDataInExecData(executionData, executionId);
								}

								return executionData;
							}),
						);
					}

					return executionDataArray;
				},
			);

			return Promise.all(returnInputData);
		}

		return inputData as INodeExecutionData[][];
	}

	// ----------------------------------
	//         private methods
	// ----------------------------------

	private createIdentifier(filename: string) {
		return `${this.mode}:${filename}`;
	}

	private splitBinaryModeFileId(fileId: string): { mode: string; id: string } {
		const [mode, id] = fileId.split(':');

		return { mode, id };
	}

	private async duplicateBinaryDataInExecData(
		executionData: INodeExecutionData,
		executionId: string,
	) {
		const client = this.clients[this.mode];

		if (executionData.binary) {
			const binaryDataKeys = Object.keys(executionData.binary);
			const bdPromises = binaryDataKeys.map(async (key: string) => {
				if (!executionData.binary) {
					return { key, newId: undefined };
				}

				const binaryDataId = executionData.binary[key].id;
				if (!binaryDataId) {
					return { key, newId: undefined };
				}

				return client
					?.copyByIdentifier(this.splitBinaryModeFileId(binaryDataId).id, executionId)
					.then((filename) => ({
						newId: this.createIdentifier(filename),
						key,
					}));
			});

			return Promise.all(bdPromises).then((b) => {
				return b.reduce((acc, curr) => {
					if (acc.binary && curr) {
						acc.binary[curr.key].id = curr.newId;
					}

					return acc;
				}, executionData);
			});
		}

		return executionData;
	}
}

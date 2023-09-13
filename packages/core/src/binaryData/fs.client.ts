import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { Readable } from 'stream';
import type { BinaryMetadata } from 'n8n-workflow';
import { jsonParse } from 'n8n-workflow';

import type { BinaryData } from './types';
import { FileNotFoundError } from '../errors';

const executionExtractionRegexp =
	/^(\w+)(?:[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})$/;

export class FileSystemClient implements BinaryData.Client {
	private storagePath: string;

	constructor(config: BinaryData.FileSystemConfig) {
		this.storagePath = config.storagePath;
	}

	async init() {
		await this.assertFolder(this.storagePath);
	}

	async getSize(identifier: string): Promise<number> {
		const stats = await fs.stat(this.getPath(identifier));
		return stats.size;
	}

	async storeMetadata(identifier: string, metadata: BinaryMetadata) {
		await fs.writeFile(this.getMetadataPath(identifier), JSON.stringify(metadata), {
			encoding: 'utf-8',
		});
	}

	async getMetadata(identifier: string): Promise<BinaryMetadata> {
		return jsonParse(await fs.readFile(this.getMetadataPath(identifier), { encoding: 'utf-8' }));
	}

	async store(binaryData: Buffer | Readable, executionId: string): Promise<string> {
		const binaryDataId = this.generateFileName(executionId);
		await this.saveToLocalStorage(binaryData, binaryDataId);
		return binaryDataId;
	}

	toStream(identifier: string, chunkSize?: number): Readable {
		return createReadStream(this.getPath(identifier), { highWaterMark: chunkSize });
	}

	async toBuffer(identifier: string): Promise<Buffer> {
		return this.retrieveFromLocalStorage(identifier);
	}

	getPath(identifier: string): string {
		return this.resolveStoragePath(identifier);
	}

	getMetadataPath(identifier: string): string {
		return this.resolveStoragePath(`${identifier}.metadata`);
	}

	async copyByPath(filePath: string, executionId: string): Promise<string> {
		const binaryDataId = this.generateFileName(executionId);
		await this.copyFileToLocalStorage(filePath, binaryDataId);
		return binaryDataId;
	}

	async copyByIdentifier(identifier: string, prefix: string): Promise<string> {
		const newBinaryDataId = this.generateFileName(prefix);

		await fs.copyFile(
			this.resolveStoragePath(identifier),
			this.resolveStoragePath(newBinaryDataId),
		);
		return newBinaryDataId;
	}

	async deleteManyByExecutionIds(executionIds: string[]): Promise<string[]> {
		const set = new Set(executionIds);
		const fileNames = await fs.readdir(this.storagePath);
		const deletedIds = [];
		for (const fileName of fileNames) {
			const executionId = fileName.match(executionExtractionRegexp)?.[1];
			if (executionId && set.has(executionId)) {
				const filePath = this.resolveStoragePath(fileName);
				await Promise.all([fs.rm(filePath), fs.rm(`${filePath}.metadata`)]);
				deletedIds.push(executionId);
			}
		}
		return deletedIds;
	}

	async deleteOne(identifier: string): Promise<void> {
		return this.deleteFromLocalStorage(identifier);
	}

	private async assertFolder(folder: string): Promise<void> {
		try {
			await fs.access(folder);
		} catch {
			await fs.mkdir(folder, { recursive: true });
		}
	}

	private generateFileName(prefix: string): string {
		return [prefix, uuid()].join('');
	}

	private async deleteFromLocalStorage(identifier: string) {
		return fs.rm(this.getPath(identifier));
	}

	private async copyFileToLocalStorage(source: string, identifier: string): Promise<void> {
		await fs.cp(source, this.getPath(identifier));
	}

	private async saveToLocalStorage(binaryData: Buffer | Readable, identifier: string) {
		await fs.writeFile(this.getPath(identifier), binaryData);
	}

	private async retrieveFromLocalStorage(identifier: string): Promise<Buffer> {
		const filePath = this.getPath(identifier);
		try {
			return await fs.readFile(filePath);
		} catch (e) {
			throw new Error(`Error finding file: ${filePath}`);
		}
	}

	private resolveStoragePath(...args: string[]) {
		const returnPath = path.join(this.storagePath, ...args);
		if (path.relative(this.storagePath, returnPath).startsWith('..')) {
			throw new FileNotFoundError('Invalid path detected');
		}
		return returnPath;
	}
}

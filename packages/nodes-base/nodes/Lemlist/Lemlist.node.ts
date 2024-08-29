import type { INodeTypeBaseDescription, IVersionedNodeType } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';

import { LemlistV1 } from './v1/Lemlist.node';

export class Lemlist extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'Lemlist',
			name: 'lemlist',
			icon: 'file:lemlist.svg',
			group: ['transform'],
			defaultVersion: 1,
			description: 'Consume the Lemlist API',
		};

		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new LemlistV1(baseDescription),
			// 2: new LemlistV2(baseDescription),
		};

		super(nodeVersions, baseDescription);
	}
}

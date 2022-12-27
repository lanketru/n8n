import { LoggerProxy } from 'n8n-workflow';
import { getLogger } from '@/Logger';
import { BaseCommand } from '@/commands/BaseCommand';
import { audit } from '@/audit';

export class SecurityAuditCommand extends BaseCommand {
	static description = 'Generate a security audit report for this n8n instance';

	static examples = ['$ n8n audit'];

	async run() {
		const logger = getLogger();
		LoggerProxy.init(logger);

		const result = await audit();

		this.logger.info(JSON.stringify(result, null, 2));
	}

	async catch(error: Error) {
		this.logger.error('Failed to generate security audit report');
		this.logger.error(error.message);
		this.exit(1);
	}
}

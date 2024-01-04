import type { CacheService } from '@/services/cache/cache.service';
import type { TestWebhookRegistration } from '@/services/test-webhook-registrations.service';
import { TestWebhookRegistrationsService } from '@/services/test-webhook-registrations.service';
import { mock } from 'jest-mock-extended';

describe('TestWebhookRegistrationsService', () => {
	const cacheService = mock<CacheService>();
	const registrations = new TestWebhookRegistrationsService(cacheService);

	const registration = mock<TestWebhookRegistration>({
		webhook: { httpMethod: 'GET', path: 'hello', webhookId: undefined },
	});

	const key = 'GET|hello';

	describe('register()', () => {
		test('should register a test webhook registration', async () => {
			await registrations.register(registration);

			expect(cacheService.setHash).toHaveBeenCalledWith('test-webhooks', { [key]: registration });
		});
	});

	describe('deregister()', () => {
		test('should deregister a test webhook registration', async () => {
			await registrations.register(registration);

			await registrations.deregister(key);

			expect(cacheService.deleteFromHash).toHaveBeenCalledWith('test-webhooks', key);
		});
	});

	describe('get()', () => {
		test('should retrieve a test webhook registration', async () => {
			cacheService.getHashValue.mockResolvedValueOnce(registration);

			const promise = registrations.get(key);

			await expect(promise).resolves.toBe(registration);
		});

		test('should return undefined if no such test webhook registration was found', async () => {
			cacheService.getHashValue.mockResolvedValueOnce(undefined);

			const promise = registrations.get(key);

			await expect(promise).resolves.toBeUndefined();
		});
	});

	describe('getAllKeys()', () => {
		test('should retrieve all test webhook registration keys', async () => {
			cacheService.getHash.mockResolvedValueOnce({ [key]: registration });

			const result = await registrations.getAllKeys();

			expect(result).toEqual([key]);
		});
	});

	describe('getAllRegistrations()', () => {
		test('should retrieve all test webhook registrations', async () => {
			cacheService.getHash.mockResolvedValueOnce({ [key]: registration });

			const result = await registrations.getAllRegistrations();

			expect(result).toEqual([registration]);
		});
	});

	describe('deregisterAll()', () => {
		test('should deregister all test webhook registrations', async () => {
			await registrations.deregisterAll();

			expect(cacheService.delete).toHaveBeenCalledWith('test-webhooks');
		});
	});

	describe('toKey()', () => {
		test('should convert a test webhook registration to a key', () => {
			const result = registrations.toKey(registration.webhook);

			expect(result).toBe(key);
		});
	});
});

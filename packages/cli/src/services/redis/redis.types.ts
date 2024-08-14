export type RedisClient = n8nRedisClient | BullRedisClient;

/**
 * Redis client used by n8n.
 *
 * - `subscriber(n8n)` to listen for messages from scaling mode communication channels
 * - `publisher(n8n)` to send messages into scaling mode communication channels
 * - `cache(n8n)` for caching operations (variables, resource ownership, etc.)
 */
type n8nRedisClient = 'subscriber(n8n)' | 'publisher(n8n)' | 'cache(n8n)';

/**
 * Redis client used internally by Bull. Suffixed with `(bull)` at `ScalingService.setupQueue`.
 *
 * - `subscriber(bull)` for event listening
 * - `client(bull)` for general queue operations
 * - `bclient(bull)` for blocking operations when processing jobs
 */
type BullRedisClient = 'subscriber(bull)' | 'client(bull)' | 'bclient(bull)';

import { Test } from "@nestjs/testing";
import Redis from "ioredis";
import { RedisLockService } from "../src/redis-lock.service";

describe("RedisLockService", () => {
    let mockRedis: jest.Mocked<Redis>;
    let keysToCleanUp: Set<string>;
    let lockService: RedisLockService;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                {
                    provide: 'REDIS_LOCK_OPTIONS',
                    useValue: {
                        redis: [{ host: '127.0.0.1', port: 6379 }],
                        logLevel: ['error', 'warn', 'log', 'debug'],
                        ttl: null
                    },
                },
                RedisLockService
            ],
        }).compile();
        
        lockService = moduleRef.get<RedisLockService>(RedisLockService);
        await lockService.onModuleInit();
    });

    beforeEach(async () => {
        keysToCleanUp = new Set();
        mockRedis = new Redis({ host: '127.0.0.1', port: 6379 }) as jest.Mocked<Redis>;
        keysToCleanUp.forEach(key => mockRedis.del(key));
    });

    afterEach(async () => {
        const deletePromises = Array.from(keysToCleanUp).map(key => mockRedis.del(key));
        await Promise.all(deletePromises);
    });

    it("should be defined", () => {
        expect(lockService).toBeDefined();
    });

    describe("lock", () => {
        it("should acquire a lock successfully", async () => {
            const key = "testKey-lock";
            const lockedResource = await lockService.lock(key);
            console.log(lockedResource);
            expect(lockedResource).toBeDefined();
            expect(lockedResource.resource).toContain(key);
            expect(lockedResource.value).toBeDefined();
            keysToCleanUp.add(lockedResource.resource);
        });
    });

    describe("unlock", () => {
        it("should successfully release a lock", async () => {
            const lockedResource = await lockService.lock("testKey-unlock");
            expect(lockedResource).toBeDefined();
            const result = await lockService.unlock(lockedResource);
            expect(result).toBeTruthy();
            keysToCleanUp.add(lockedResource.resource);
        });
    });
});
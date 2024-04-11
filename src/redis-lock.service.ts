import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import type { AcquireOptions, LockAvailabilityStatus, LockedResource, RedisLockModuleOptions } from "./types";
import Redis from "ioredis";
import { customAlphabet } from "nanoid";
import { DEFAULT_PREFIX, RETRY_DELAY } from "./constants";
import { CHECK_LOCK_STATUS_SCRIPT, LOCK_SCRIPT, RENEW_SCRIPT, UNLOCK_SCRIPT } from "./scripts";
import { LockAcquisitionError, LockRemovalError, LockRenewalError } from "./errors";

const nanoid = customAlphabet("123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 20);

@Injectable()
export class RedisLockService implements OnModuleInit, OnApplicationShutdown {
    private readonly logger = new Logger(RedisLockService.name);
    private clients: Set<Redis> = new Set();
    private quorum: number;

    constructor(@Inject("REDIS_LOCK_OPTIONS") protected readonly config: RedisLockModuleOptions) { }

    async onModuleInit() {
        if (!this.config.redis.length) throw new Error("No Redis connection options provided.");
        this.log("log", `Connecting to Redis instance/s.`)
        for (const redisConfig of this.config.redis) {
            const client = new Redis(redisConfig.port, redisConfig.host, { ...redisConfig, lazyConnect: true });
            try {
                await client.connect();
                this.clients.add(client);
                this.log("debug", `Connected to Redis on host: ${redisConfig.host}`);
            } catch (error) {
                this.log("error", `Failed to connect to Redis on host: ${redisConfig.host}. Error: ${error.message}`);
            }
        }
        this.quorum = Math.min(this.clients.size, Math.ceil(this.clients.size / 2) + 1);
    }

    async onApplicationShutdown(signal?: string) {
        this.log("debug", `Shutting down Redis Lock. Signal: ${signal}`);
        this.log("log", `Disconnecting from Redis instance/s.`);
        this.clients.forEach(async (client) => {
            await client.disconnect();
        });
    }

    async lock(key: string, opts?: AcquireOptions): Promise<LockedResource> {
        const resource = this.getResourceName(key);
        const value = nanoid(); /* Get Unique Value. */
        const cleanUp = () => { /* Try to unlock all the instances (even the instances it believed it was not able to lock). */
            try {
                return this.unlock({ resource, value, ttl: null, acquiredAt: Date.now() } as LockedResource);
            } catch { /* Ignore errors */ }
        }
        const options = this.getOptions(opts);
        let attempt = 0;
        const processStart = Date.now();

        while(true) {
            const start = Date.now(); /* Get the current time in milliseconds */
            let acquiredLocks = 0;
            let errorLocks = 0;

            attempt++;
             
            for (const client of this.clients) { /* Try to acquire the lock in all the N instances sequentially, using the same key name and random value in all the instances */
                try {
                    this.log("debug", `Trying (attempt: ${attempt}) to acquire lock for resource: ${resource} on host: ${client.options.host}`);
                    const result = await client.eval(LOCK_SCRIPT, 1, resource, value, options.ttl);
                    if (result === "OK") {
                        this.log("debug", `Lock acquired (attempt: ${attempt}) for resource: ${resource} on host: ${client.options.host}`);
                        acquiredLocks++;
                    }
                } catch (error) {
                    errorLocks++;
                    this.log("error", `Error acquiring lock for resource: ${resource} on host: ${client.options.host}, Error: ${error.message}`);
                }
            }

            const elapsed = Date.now() - start;
            const drift = this.config.ttl? Math.round((this.config.driftFactor ?? this.config.driftFactor) * this.config.ttl) + 2: 0;

            /*  If and only if we were able to be acquired the lock in the majority of the instances. (and if ttl was provided and the total time elapsed to acquire the lock is less than lock validity time), the lock is considered to be acquired */
            if (this.majorityReached(acquiredLocks) && (!options.ttl || (acquiredLocks >= this.quorum && elapsed < options.ttl))) {
                if (acquiredLocks === this.clients.size) { /* If all instances were able to acquire the lock */
                    this.log("log", `Lock acquired (attempt: ${attempt}) for resource: ${resource} on all instances.`);
                } else this.log("log", `Lock acquired (attempt: ${attempt}) for resource: ${resource} on majority: ${acquiredLocks} of the instances: ${this.clients.size}.`);
                return { resource, value, acquiredAt: Date.now(), ttl: options.ttl? (options.ttl + drift): null, expiresAt: options.ttl? (processStart + options.ttl) - drift: null};
            }


            if (acquiredLocks) await cleanUp();

            if (this.majorityReached(errorLocks)) { /* If there were errors on majority of servers */
                this.log("debug", `Failed (attempt: ${attempt}) to acquire lock for resource: ${resource}. Majority of servers failed to acquire the lock.`);
                throw new LockAcquisitionError(`Failed to acquire lock for resource: ${resource}. Majority of servers failed to acquire the lock.`);
            }

            if (options.failAfter && (Date.now() - processStart) > options.failAfter) {
                this.log("debug", `Failed (attempt: ${attempt}) to acquire lock for resource: ${resource}. Exceded failure time limit: ${options.failAfter}.`);
                throw new LockAcquisitionError(`Failed to acquire lock for resource: ${resource}. Exceded failure time limit: ${options.failAfter}.`);                    
            }
            
            this.log("debug", `Failed on attempt: ${attempt} to acquire lock for resource: ${resource}. Retrying...`);
            await new Promise(resolve => setTimeout(resolve, options.retryDelay));
        }
    }

    async unlock(release: LockedResource) {
        this.log("debug", `Trying to release lock for resource: ${release}`);
        let unlockedLocks = 0;
        for (const client of this.clients) {
            try {
                this.log("debug", `Trying to remove lock for resource: ${release} on client: ${client.options.host}`);
                const result = await client.eval(UNLOCK_SCRIPT, 1, release.resource, release.value);
                if (result === 1) {
                    unlockedLocks++;
                    this.log("debug", `Lock removed for resource: ${release} on client: ${client.options.host}`);
                }
            } catch (error) {
                this.log("error", `Could not remove lock for resource: ${release} on client: ${client.options.host}, Error: ${error.message}`);
            }
        }

        if (!unlockedLocks) throw new LockRemovalError(`Could not remove lock for resource: ${release}`);
        if (this.majorityReached(unlockedLocks)) this.log("warn", `Lock removed for resource: ${release}, but not all instances were able to remove the lock.`);
       
        this.log("log", `Lock removed for resource: ${release}`);
        return true;
    }

    async renewLock(lockedResource: LockedResource, ttl: number): Promise<LockedResource> {
        if (!lockedResource.ttl) throw new LockRenewalError("Lock does not have a TTL set.");
    
        let renewdLocks = 0;
        let errorLocks = 0;
        const processStart = Date.now();

        for (const client of this.clients) {
            try {
                const result = await client.eval(RENEW_SCRIPT, 1, lockedResource.resource, lockedResource.value, ttl.toString());
                if (result === 0) {
                    this.log("error", `Failed to renew lock for resource: ${lockedResource.resource}`);
                } else {
                    renewdLocks++;
                    this.log("debug", `Lock renewed for resource: ${lockedResource.resource} on client: ${client.options.host}`);
                }
            } catch (error) {
                errorLocks++;
                this.log("error", `Error renewing lock for resource: ${lockedResource.resource}: ${error.message}`);
            }
        }

        const drift = lockedResource.ttl? Math.round((this.config.driftFactor ?? this.config.driftFactor) * lockedResource.ttl) + 2: 0;

        if (this.majorityReached(renewdLocks)) {
            if (renewdLocks === this.clients.size) { /* If all instances were able to acquire the lock */
                this.log("log", `Lock renews for resource: ${lockedResource.resource} on all instances.`);
            } else this.log("log", `Lock renews for resource: ${lockedResource.resource} on majority: ${renewdLocks} of the instances: ${this.clients.size}.`);
            return { resource: lockedResource.resource, value: lockedResource.value, acquiredAt: Date.now(), ttl: lockedResource.ttl + drift?? null, expiresAt: lockedResource.ttl? (processStart + lockedResource.ttl) - drift: null};
        }

        throw new LockRenewalError(`Could not renew lock for resource: ${lockedResource.resource}`);
    }

    async checkLockStatus(lockedResource: LockedResource): Promise<LockAvailabilityStatus> {
        for (const client of this.clients) {
            try {
                const result = await client.eval(CHECK_LOCK_STATUS_SCRIPT, 1, lockedResource.resource, lockedResource.value);
                if (result === "ACQUIRED" || result === "LOCKED") {
                    return result;
                }
            } catch (error) {
                this.log("error", `Error checking lock status for resource: ${lockedResource.resource}: ${error.message}`);
            }
        }
        return "AVAILABLE";
    }

    private majorityReached(acquiredLocks: number) {
        return acquiredLocks >= this.quorum;
    }

    private getOptions(options?: AcquireOptions): AcquireOptions {
        return {
            failAfter: options?.failAfter || this.config?.failAfter || Infinity,
            retryDelay: options?.retryDelay || this.config?.retryDelay || RETRY_DELAY,
            ttl: options?.ttl || this.config?.ttl || null,
        }
    }

    private getResourceName(key: string) {
        return `${this.config.prefix?? DEFAULT_PREFIX}${key}`;
    }

    private log(level: "error" | "warn" | "log" | "debug", message: string, context?: string) {
        if (!Array.isArray(this.config.logLevel) || !this.config.logLevel.includes(level)) return; 
        this.logger[level](message, context);
    }
}
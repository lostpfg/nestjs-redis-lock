/*
 * @Author: Peter Fousteris (petfoust@gmail.com)   
 * @Date: 2024-04-09 17:36:46 
 * @Last Modified by: Peter Fousteris (petfoust@gmail.com)  
 * @Last Modified time: 2024-04-10 14:05:09
 */

import type { RedisOptions } from "ioredis";

type Nullable<T> = T | null;

export type LockAvailabilityStatus = "ACQUIRED" | "LOCKED" | "AVAILABLE";

export type AcquireOptions = Pick<RedisLockModuleOptions, "ttl" | "retryDelay" | "failAfter">;

export type RedisLockModuleAsyncOptions = {
	imports?: any[];
	inject?: any[];
	useFactory: (
		...args: any[]
	) => Promise<RedisLockModuleOptions> | RedisLockModuleOptions;
}

export type RedisLockModuleOptions = {
	/**
	 * @description
	 * The Redis connection options.
	 */
	redis: Array<Pick<RedisOptions, "host" | "port" | "db" | "username" | "password" | "connectionName">>;
	/**
	 * @description
	 * The prefix to be used for the lock key.
	 * @default "redis:lock:"
	 */
	prefix?: string;
	/**
	 * @description
	 * The time in milliseconds. If null, the lock will not expire.
	 * @default null
	 */
	ttl?: number;
	/**
	 * @description
	 * The time in milliseconds to wait before retrying to acquire a lock.
	 * @default 100
	 */
	retryDelay?: number;
	/**
	 * @description
	 * The time in milliseconds to wait before failing to acquire a lock.
	 */
	failAfter?: number;
	/**
	 * @description
	 * The time in milliseconds to wait before failing to acquire a lock.
	 */
	driftFactor?: number;
	/**
	 * @description
	 * If true, all locks will be cleared on shutdown.
	 * Useful for testing. Not recommended for production.
	 * @default false
	 */
	clearOnShutDown?: boolean;
	/**
	 * @description
	 * If true, all locks will be cleared on startup.
	 * Useful for testing. Not recommended for production.
	 * @default false
	 */
	clearOnStartUp?: boolean;
	/**
	 * @description
	 * Defines the log level for the module.
	 * @default false
	 */
	logLevel?: false | Array<"error" | "warn" | "log" | "debug">;
}

export type LockedResource = {
	resource: string;
	value: string;
	ttl: Nullable<number>;
	expiresAt: Nullable<number>;
	acquiredAt: number;
}
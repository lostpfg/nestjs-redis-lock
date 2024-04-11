import { DynamicModule, Global, Module, type Provider } from "@nestjs/common";
import { RedisLockService } from "./redis-lock.service";
import type { RedisLockModuleAsyncOptions, RedisLockModuleOptions } from "./types";

@Global()
@Module({})
export class RedisLockModule {
	static forRoot(options: RedisLockModuleOptions): DynamicModule {
		return {
			module: RedisLockModule,
			providers: [
				{
					provide: "REDIS_LOCK_OPTIONS",
					useValue: options,
				},
				RedisLockService,
			],
			exports: [RedisLockService],
		};
	}

	static forRootAsync(options: RedisLockModuleAsyncOptions): DynamicModule {
		return {
			module: RedisLockModule,
			imports: options.imports || [],
			providers: [
				this.createAsyncOptionsProvider(options),
				RedisLockService,
			],
			exports: [RedisLockService],
		};
	}

	private static createAsyncOptionsProvider(options: RedisLockModuleAsyncOptions): Provider {
		return {
			provide: "REDIS_LOCK_OPTIONS",
			useFactory: options.useFactory,
			inject: options.inject || [],
		};
	}
}
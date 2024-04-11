# RedisLockModule
The RedisLockModule provides a mechanism for managing distributed locks within your NestJS application using Redis.

## Features
Distributed Locking: With the power of Redis create locks across different instances of your application.
Global Module: Once imported, the RedisLockService is globally available in your application.

## Usage
### Synchronous Configuration
You can configure the RedisLockModule synchronously by providing RedisLockModuleOptions:

``` typescript
import { Module } from "@nestjs/common";
import { RedisLockModule } from "@lostpfg/nestjs-redis-lock";

@Module({
    imports: [
        RedisLockModule.forRoot({
            redis: [{ 
                host: "127.0.0.1",
                port: 6379,
                // other options as db, user etc.
            }],
            // other options...
        }),
    ],
})
export class AppModule {}
```

### Asynchronous Configuration
For asynchronous configuration, use forRootAsync method and provide RedisLockModuleAsyncOptions:

``` typescript
import { Module } from "@nestjs/common";
import { RedisLockModule } from "./redis-lock.module";
import { ConfigModule, ConfigService } from "@lostpfg/nestjs-redis-lock";

@Module({
  imports: [
    RedisLockModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: [{
          host: configService.get(...),
          port: configService.get(...),
        }],
        // other options...
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Acquiring and Releasing Locks
To acquire and release locks, inject the RedisLockService into your services:

``` typescript
import { Injectable } from "@nestjs/common";
import { RedisLockService } from "@lostpfg/nestjs-redis-lock";

@Injectable()
export class YourService {
  constructor(private readonly lockService: RedisLockService) {}

  async yourMethod() {
    try {
        const lock = await this.lockService.lock('your-resource-key');
        // Your logic here...
    } finally {
        await this.lockService.unlock(lock);
    }
  }
}
```
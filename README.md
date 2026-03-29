# Typelemetry

[![NPM Version](https://img.shields.io/npm/v/@zimtsui/typelemetry?style=flat-square)](https://www.npmjs.com/package/@zimtsui/typelemetry)

TypeLog is a strongly typed logger for concurrent TypeScript programs.

## Channel

```ts
import { Channel, type LogEventTarget, LogEvent } from '@zimtsui/typelemetry';

// Declare all log levels whose values are sorted from verbose to severe.
enum Level { trace, debug, info, warn, error }

// Declare log levels for different environments.
const envlevels: Record<string, Level> = {
	debug: Level.trace,
	development: Level.debug,
	production: Level.warn,
};

// Determine the log level according to the environment variable.
declare const ENV: string;
const envLevel = envlevels[ENV] ?? Level.info;

// Create an event target for listening to log events.
type channelMap = {
    symbolChannelEventType: [typeof Level, payloadType: symbol];
    numberChannelEventType: [typeof Level, payloadType: number];
};
const eventTarget = new EventTarget() as LogEventTarget<channelMap>;
eventTarget.addEventListener(
    'numberChannelEventType',
    (evt: LogEvent<'numberChannelEventType', typeof Level, number>) => {
        if (evt.level >= envLevel) console.log(evt.detail satisfies number);
    },
);
eventTarget.addEventListener(
    'symbolChannelEventType',
    (evt: LogEvent<'symbolChannelEventType', typeof Level, symbol>) => {
        if (evt.level >= envLevel) console.log(evt.detail satisfies symbol);
    },
);

// Create loggers.
const logger = {
    symbolChannel: Channel.attach<channelMap, 'symbolChannelEventType'>(eventTarget, 'symbolChannelEventType', Level),
    numberChannel: Channel.attach<channelMap, 'numberChannelEventType'>(eventTarget, 'numberChannelEventType', Level),
	stringChannel: Channel.create<typeof Level, string>(Level, (message, level) => {
		if (level >= envLevel) console.log(message);
	}),
};

// Use loggers.
logger.symbolChannel.info(Symbol('Hello, world!'));
logger.numberChannel.warn(10086);
logger.stringChannel.trace('Hello, world!');
```

## Level presets

```ts
import { Channel } from '@zimtsui/typelemetry';
import * as Presets from '@zimtsui/typelemetry/presets';
import { env, stderr } from 'node:process';
import { formatWithOptions } from 'node:util';

const envLevel = Presets.envlevels[env.NODE_ENV ?? ''] ?? Presets.Level.info;

export const channel = Channel.create(
	Presets.Level,
	(message, level) => {
		if (level >= envLevel) console.error(formatWithOptions({ depth: null, colors: !!stderr.isTTY }, message));
	},
);
```

## Trace

```ts
import { Tracer } from '@zimtsui/typelemetry/trace';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
    traceExporter: new ConsoleSpanExporter(),
});
sdk.start();
const tracer = Tracer.create('example', '0.0.1');

class A {
    @tracer.forkedAsync()
    public async f2(x: number): Promise<string> {
        return f3(x);
    }
    @tracer.forkedSync()
    public f4(x: number): string  {
        return String(x);
    }
}
const a = new A();

namespace F3 {
    export function create() {
        function f3(x: number): string {
            return a.f4(x);
        }
        return (x: number) => tracer.forkSync(f3.name, () => f3(x));
    }
}
const f3 = F3.create();

namespace F1 {
    export function create() {
        async function f1(x: number): Promise<string> {
            return await a.f2(x);
        }
        return (x: number) => tracer.forkAsync(f1.name, () => f1(x));
    }
}
const f1 = F1.create();

console.log(await f1(100));
await sdk.shutdown();
```

## Fallback of OpenTelemetry Node.js SDK

OpenTelemetry Node.js Log SDK has no stable release yet. Typelog provides a fallback implementation.

```ts
import { Exporter } from '@zimtsui/typelemetry/exporter';
import * as Presets from '@zimtsui/typelemetry/presets';
import { Channel } from '@zimtsui/typelemetry';
import { formatWithOptions } from 'node:util';
import { stderr } from 'node:process';

const exporter: Exporter = {
    monolith: ({ payload }) => {
        console.error(formatWithOptions({ depth: null, colors: !!stderr.isTTY }, payload));
    },
    stream: () => {},
};

Exporter.setGlobalExporter(exporter);

const channel = Channel.create(
	Presets.Level,
	(payload, level) => {
        if (level >= Presets.Level.info)
            Exporter.getGlobalExporter().monolith({
                level,
                scope: 'Example',
                channel: 'Default',
                payload,
            });
	},
);

channel.info('Hello, world!');
```

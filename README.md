# TypeLog

[![Npm package version](https://flat.badgen.net/npm/v/@zimtsui/typelog)](https://www.npmjs.com/package/@zimtsui/typelog)

TypeLog is a strongly typed logger for concurrent TypeScript programs.

## Channel

```ts
import { Channel, type LogEventTarget, LogEvent } from '@zimtsui/typelog';

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
const eventTarget = new EventTarget() as LogEventTarget<{
    symbolChannelEventType: [typeof Level, payloadType: symbol];
    numberChannelEventType: [typeof Level, payloadType: number];
}>;
eventTarget.addEventListener('numberChannelEventType', (evt: LogEvent<'numberChannelEventType', typeof Level, number>) => {
    if (evt.level >= envLevel) console.log(evt.detail satisfies number);
});
eventTarget.addEventListener('symbolChannelEventType', (evt: LogEvent<'symbolChannelEventType', typeof Level, symbol>) => {
    if (evt.level >= envLevel) console.log(evt.detail satisfies symbol);
});


// Create loggers.
const logger = {
    symbolChannel: Channel.attach(eventTarget, 'symbolChannelEventType', Level),
    numberChannel: Channel.attach(eventTarget, 'numberChannelEventType', Level),
	stringChannel: Channel.create<typeof Level, string>(Level, (message, level) => {
		if (level >= envLevel) console.log(message);
	}),
};

// Use loggers.
logger.symbolChannel.info(Symbol('Hello, world!'));
logger.numberChannel.warn(10086);
logger.stringChannel.trace('Hello, world!');
```

## Good Practice for Node.js

```ts
import { Channel } from '@zimtsui/typelog';
import * as Presets from '@zimtsui/typelog/presets';
import { env, stderr } from 'node:process';
import { formatWithOptions } from 'node:util';

const envLevel = Presets.envlevels[env.NODE_ENV ?? ''] ?? Presets.Level.info;

export const channel = Channel.create(
	Presets.Level,
	(message, level) => {
		if (level >= envLevel) console.error(
			Presets.prompt(
				formatWithOptions({ depth: null, colors: !!stderr.isTTY }, message),
				'Default',
				level,
				stderr.isTTY,
			),
		);
	},
);
```

## Tracer

```ts
import { Tracer } from '@zimtsui/typelog/tracer';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
    traceExporter: new ConsoleSpanExporter(),
});
sdk.start();
const tracer = Tracer.create('example', '0.0.1');

class A {
    @tracer.activeAsync()
    public async f2(x: number): Promise<string> {
        return f3(x);
    }
    @tracer.activeSync()
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
        return (x: number) => tracer.activateSync(f3.name, () => f3(x));
    }
}
const f3 = F3.create();

namespace F1 {
    export function create() {
        async function f1(x: number): Promise<string> {
            return await a.f2(x);
        }
        return (x: number) => tracer.activateAsync(f1.name, () => f1(x));
    }
}
const f1 = F1.create();

console.log(await f1(100));
await sdk.shutdown();
```

## Stage

```ts
import * as Stage from '@zimtsui/typelog/stage';

function forked(slave: Stage.Thread) {
    const master = Stage.getThread();
    console.log(`Thread ${slave.name}(${slave.threadId}) forked from ${master.name}(${master.threadId})`);
}

function joined(slave: Stage.Thread) {
    const master = Stage.getThread();
    console.log(`Thread ${slave.name}(${slave.threadId}) joined to ${master.name}(${master.threadId})`);
}

async function f4(x: number) {
    const masterThread = Stage.getThread();
    const slaveThread = Stage.forkSync(f1.name, forked);
    Stage.sw1tch(slaveThread);
    try {
        return await f1(x);
    } finally {
        Stage.sw1tch(masterThread);
        Stage.joinSync(slaveThread, joined);
    }
}

async function f3(x: number) {
    const a = Stage.fork(f2.name, () => f2(x), forked);
    const b = Stage.fork(f2.name, () => f2(x + 1), forked);
    const p = await Stage.join(a, joined);
    const q = await Stage.join(b, joined);
    return p + q;
}

async function f2(x: number) {
    return await Stage.fork(f2.name, () => f1(x), forked);
}

async function f1(x: number) {
    return String(x);
}

console.log(await f3(100));
console.log(await f4(200));
```

## OpenTelemetry Log Fallback

For the moment at March 2026, [OpenTelemetry Node.js SDK has no stable release yet.](https://opentelemetry.io/docs/languages/)

A simple console exporter is provided for workaround.

```ts
import { exporter } from '@zimtsui/typelog/fallback';
import * as Presets from '@zimtsui/typelog/presets';

exporter.monolith({
    level: Presets.Level.info,
    scope: 'Example',
    channel: 'Default',
    payload: 'Hello, world!',
});

exporter.stream({
    level: Presets.Level.info,
    scope: 'Example',
    channel: 'Default',
    payload: 'Hello, world!',
});
```

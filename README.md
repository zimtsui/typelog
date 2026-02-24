# TypeLog

[![Npm package version](https://flat.badgen.net/npm/v/@zimtsui/typelog)](https://www.npmjs.com/package/@zimtsui/typelog)

TypeLog is a strongly typed logger for TypeScript.

## Usage

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

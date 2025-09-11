# TypeLog

[![Npm package version](https://flat.badgen.net/npm/v/@zimtsui/typelog)](https://www.npmjs.com/package/@zimtsui/typelog)

TypeLog is a strongly typed logger for TypeScript.

## Usage

```ts
import { Channel } from '@zimtsui/typelog';
import { stderr } from 'node:process';

// Declare all log levels whose values are sorted from verbose to severe.
enum Level { trace, debug, info, warn, error }

// Declare log levels for different environments.
const envlevels: Record<string, Level> = {
	debug: Level.trace,
	development: Level.debug,
	production: Level.warn,
};

// Determine the log level according to the environment variable.
const envLevel = envlevels[process.env.NODE_ENV ?? ''] ?? Level.info;

// Create loggers.
const logger = {
	verbatim: Channel.create<typeof Level, string>(Level, (message, level) => {
		if (level >= envLevel) stderr.write(message);
	}),
	pretty: Channel.create<Record<keyof typeof Level, Level>, unknown>(Level, (message, level) => {
		if (level >= envLevel) console.error(message);
	}),
};

// Use loggers.
logger.verbatim.info('Hello, world!');
logger.pretty.info('Hello, world!');
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
				formatWithOptions({ depth: null, colors: stderr.isTTY }, message),
				'Default',
				level,
				stderr.isTTY,
			),
		);
	},
);
```

# TypeLog

[![Npm package version](https://flat.badgen.net/npm/v/@zimtsui/typelog)](https://www.npmjs.com/package/@zimtsui/typelog)

TypeLog is a strongly typed logger for TypeScript.

## Usage

```ts
import { type Logger, Channel } from '@zimtsui/typelog';

// define log levels sorted from verbose to severe
const levels = ['trace', 'debug', 'info', 'warn', 'error'] as const;

// define log levels for different environments
const envlevels: Record<string, typeof levels[number]> = {
	debug: 'trace',
	development: 'debug',
	production: 'warn',
};
const level: typeof levels[number] = envlevels[env.NODE_ENV ?? ''] ?? 'info';

// define channels
interface Channels {
	verbatim: [levels: typeof levels, message: string];
	pretty: [levels: typeof levels, message: unknown];
}

// create loggers
const logger: Logger<Channels> = {
	verbatim: Channel.create(levels, level, (message: string, level) => message, (message, level) => stderr.write(message)),
	pretty: Channel.create(levels, level, (message: unknown, level) => message, (message, level) => console.error(message)),
};

// use loggers
logger.verbatim.info('Hello, world!');
logger.pretty.info('Hello, world!');
```

## Good Practice for Node.js

```ts
import { Presets, Channel } from '@zimtsui/typelog';
import { env, stderr } from 'node:process';
import { formatWithOptions } from 'node:util';

const level: typeof Presets.levels[number] = Presets.envlevels[env.NODE_ENV ?? ''] ?? 'info';

export const channel = Channel.create(
	Presets.levels, level,
	(message, level) => formatWithOptions({ depth: null, colors: stderr.isTTY }, message),
	(message, level) => console.error(
		Presets.prompt(message, 'Default Channel', level, stderr.isTTY),
	),
);
```

# TypeLog

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
	verbatim: Channel.create(levels, level, (message: string) => stderr.write(message)),
	pretty: Channel.create(levels, level, (message: unknown) => console.error(message)),
};

// use loggers
logger.verbatim.info('Hello, world!');
logger.pretty.info('Hello, world!');
```

## Good Practice for Node.js

```ts
import { Presets, Channel } from '@zimtsui/typelog';
import { env } from 'node:process';
import { formatWithOptions } from 'node:util';

const level: typeof Presets.levels[number] = Presets.envlevels[env.NODE_ENV ?? ''] ?? 'info';

export const channel = Channel.create(
	'Default Channel', Presets.levels, level,
	(message, channelName, level) => console.error(
		Presets.format(
			formatWithOptions({ depth: null, colors: true }, message),
			channelName,
			level,
		),
	),
);
```

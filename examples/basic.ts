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

const envLevel = envlevels[process.env.NODE_ENV ?? ''] ?? Level.info;

// Create loggers.
const logger = {
	verbatim: Channel.create(Level, (message: string, level) => {
		if (level >= envLevel) stderr.write(message);
	}),
	pretty: Channel.create(Level, (message: unknown, level) => {
		if (level >= envLevel) console.error(message);
	}),
};

// Use loggers.
logger.verbatim.info('Hello, world!');
logger.pretty.info('Hello, world!');

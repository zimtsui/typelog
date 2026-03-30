import { Channel, Exporter } from '@zimtsui/typelemetry/log';
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
declare const ENV: string;
const envLevel = envlevels[ENV] ?? Level.info;

// Create exporters.
const consoleExporter: Exporter = {
    monolith(message) {
        if (typeof message.payload === 'string') {
            console.log(message.level);
            console.log(message.payload);
        }
    },
    stream(chunk) {
        if (typeof chunk.payload === 'string') {
            stderr.write(chunk.payload);
        }
    },
};
Exporter.setGlobalExporter(consoleExporter);

// Create loggers.
const logger = {
	number: Channel.create<typeof Level, number>(Level, (message, level) => {
		if (level >= envLevel) Exporter.getGlobalExporter().monolith({
            scope: 'main',
            level: Level[level],
            payload: message,
            channel: 'number',
        });
	}),
	string: Channel.create<typeof Level, string>(Level, (message, level) => {
		if (level >= envLevel) Exporter.getGlobalExporter().monolith({
            scope: 'main',
            level: Level[level],
            payload: message,
            channel: 'string',
        });
	}),
};

// Use loggers.
logger.string.info('Hello');
logger.number.warn(10086);

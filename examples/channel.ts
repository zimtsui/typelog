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

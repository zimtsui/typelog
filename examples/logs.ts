import { LevelMap, Preprocessor, LoggerProvider } from '@zimtsui/typelemetry/logs';
import * as OTEL_SDK_LOGS from '@opentelemetry/sdk-logs';
import * as OTEL_SDK from '@opentelemetry/sdk-node';
import { env } from 'node:process';

// Declare all log levels whose values are sorted from verbose to severe.
const levelMap = { debug: 5, info: 9, warn: 13, error: 17 } satisfies LevelMap.Proto;

// Determine the log level according to the environment variable.
const envLevel = env.LOG_LEVEL && (levelMap as LevelMap.Proto)[env.LOG_LEVEL] || levelMap.info;

// Create exporters.
const preprocessor: Preprocessor<typeof levelMap> = (data, next) => {
    // Make data.message serializable and pass it through into OpenTelemetry API
    if (data.levelNumber >= envLevel) next(JSON.parse(JSON.stringify(data.message)));
};

// Create a LoggerProvider
const loggerProvider = new LoggerProvider(levelMap);
loggerProvider.addPreprocessor(preprocessor);


// Create loggers.
const loggers = {
    cost: loggerProvider.getLogger<number>('Scope name', 'Optional event name'),
    text: loggerProvider.getLogger<string>('Scope name', 'Optional event name'),
};

// Configure OpenTelemetry SDK
new OTEL_SDK.NodeSDK({
    logRecordProcessors: [
        new OTEL_SDK_LOGS.SimpleLogRecordProcessor(
            new OTEL_SDK_LOGS.ConsoleLogRecordExporter(),
        ),
    ],
}).start();

// Use loggers.
loggers.cost.warn(10086);
loggers.text.info('Hello');

import { LevelMap, Preprocessor, LoggerProvider } from '@zimtsui/typelemetry/logs';
import * as OTEL_SDK_LOGS from '@opentelemetry/sdk-logs';
import * as OTEL_SDK from '@opentelemetry/sdk-node';

// Declare all log levels whose values are sorted from verbose to severe.
const levelMap = { debug: 5, info: 9, warn: 13, error: 17 } satisfies LevelMap.Prototype;

// Declare log levels for different environments.
const envlevels: Record<string, LevelMap.Number<typeof levelMap>> = {
    debug: levelMap.debug,
    development: levelMap.debug,
    production: levelMap.warn,
};

// Determine the log level according to the environment variable.
const ENV: string = 'development';
const envLevel = envlevels[ENV] ?? levelMap.info;

// Create exporters.
const preprocessor: Preprocessor<typeof levelMap> = (data, next) => {
    // Make data.message serializable and transfer it to OpenTelemetry API
    if (data.levelNumber >= envLevel) next(JSON.parse(JSON.stringify(data.message)));
};

// Create a LoggerProvider
const loggerProvider = new LoggerProvider([preprocessor]);

// Create loggers.
const loggers = {
    cost: loggerProvider.getLogger<number>('Scope name', levelMap, 'Optional event name'),
    text: loggerProvider.getLogger<string>('Scope name', levelMap, 'Optional event name'),
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

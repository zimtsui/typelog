import { LevelMap } from './level.ts';
import * as OTEL_API_LOGS from '@opentelemetry/api-logs';
import * as OTEL_API from '@opentelemetry/api';
import { Preprocessor } from './preprocessor';
import { Logger } from './logger.ts';



export class LoggerProvider<levelMap extends LevelMap.Prototype> {
    public constructor(protected preprocessors: Preprocessor<levelMap>[]) {}

    public addPreprocessor(preprocessor: Preprocessor<levelMap>) {
        this.preprocessors.push(preprocessor);
    }

    public getLogger<message>(scopeName: string, levelMap: levelMap, eventName?: string): Logger<levelMap, message> {
        const otelLoggerProvider = OTEL_API_LOGS.logs.getLoggerProvider();
        const otelLogger = otelLoggerProvider.getLogger(scopeName);
        const that = this;
        return new Proxy({} as Logger<levelMap, message>, {
            get(target, prop) {
                if (typeof prop === 'string' && Object.keys(levelMap).includes(prop)) {
                    const now = Date.now();
                    const levelText = prop as LevelMap.Text<levelMap>;
                    const levelNumber = levelMap[levelText]!;
                    const next: Preprocessor.Otel = body => {
                        otelLogger.emit({
                            body,
                            severityText: levelText,
                            severityNumber: levelNumber,
                            observedTimestamp: Date.now(),
                        });
                    }
                    return (message: message, attributes?: OTEL_API.Attributes) => {
                        for (const processor of that.preprocessors) {
                            const data: Preprocessor.Data = {
                                scopeName,
                                eventName,
                                message: message,
                                levelText,
                                levelNumber,
                                observedTimestampMs: now,
                                attributes: attributes ?? {},
                            };
                            processor(data, next);
                        }
                    };
                } else throw new Error();
            },
        });
    }
}

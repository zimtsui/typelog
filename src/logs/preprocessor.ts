import { LevelMap } from './level.ts';
import * as OTEL_API_LOGS from '@opentelemetry/api-logs';
import * as OTEL_API from '@opentelemetry/api';



export interface Preprocessor<levelMap extends LevelMap.Prototype>{
    (data: Preprocessor.Data, otel: Preprocessor.Otel): void;
}
export namespace Preprocessor {
    export interface Otel {
        (body: OTEL_API_LOGS.AnyValue): void;
    }
    export interface Data {
        scopeName: string;
        eventName?: string;
        message: unknown;
        levelText: string;
        levelNumber: number;
        observedTimestampMs: number;
        attributes: OTEL_API.Attributes;
    }
}

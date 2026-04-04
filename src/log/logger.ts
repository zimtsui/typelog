import * as OTEL_API from '@opentelemetry/api';
import { LevelMap } from './level.ts';



export type Logger<levelMap extends LevelMap.Prototype, message> = {
    [level in LevelMap.Text<levelMap>]: (message: message, attributes?: OTEL_API.Attributes) => void;
};

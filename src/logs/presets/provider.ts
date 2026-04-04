import { LoggerProvider } from '../provider.ts';
import { levelMap } from './level.ts';


let loggerProvider = new LoggerProvider<typeof levelMap>([]);
export function setGlobalLoggerProvider(provider: LoggerProvider<typeof levelMap>) {
    loggerProvider = provider;
}
export function getGlobalLoggerProvider() {
    return loggerProvider;
}

import { LoggerProvider } from '../provider.ts';
import { levelMap } from './level.ts';
import { Logger as GenericLogger } from '../logger.ts';


export const loggerProvider = new LoggerProvider<typeof levelMap>(levelMap);
export type Logger<message> = GenericLogger<typeof levelMap, message>;

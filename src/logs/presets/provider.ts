import { LoggerProvider } from '../provider.ts';
import { levelMap } from './level.ts';


export const loggerProvider = new LoggerProvider<typeof levelMap>([]);

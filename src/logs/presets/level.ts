import { LevelMap } from '../level.ts';

export const levelMap = {
    trace: 1,
    debug: 5,
    info: 9,
    warn: 13,
    error: 17,
    critical: 21,
    silent: 25,
} satisfies LevelMap.Prototype;

export const envlevels: Record<string, LevelMap.Number<typeof levelMap>> = {
    debug: levelMap.debug,
    development: levelMap.info,
    production: levelMap.error,
};

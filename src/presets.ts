
export enum Level {
    trace,
    debug,
    info,
    warn,
    error,
    critical,
    silent,
}

export const envlevels: Record<string, Level> = {
    debug: Level.trace,
    development: Level.debug,
    production: Level.warn,
};

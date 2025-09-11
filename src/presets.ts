import chalk from 'chalk';

export enum Level {
	trace,
	debug,
	info,
	warn,
	error,
	fatal,
	silent,
}

export const envlevels: Record<string, Level> = {
	debug: Level.trace,
	development: Level.debug,
	production: Level.warn,
};

export function prompt(message: string, channelName: string, level: Level, colored = false): string {
	switch (level) {
		case Level.warn:
			return `[${new Date().toLocaleString('zh-CN')}] ${channelName} ${colored ? chalk.bgYellow(Level[level]) : Level[level]} ${message}`;
		case Level.error:
			return `[${new Date().toLocaleString('zh-CN')}] ${channelName} ${colored ? chalk.bgRed(Level[level]) : Level[level]} ${message}`;
		default:
			return `[${new Date().toLocaleString('zh-CN')}] ${channelName} ${colored ? chalk.bgGray(Level[level]) : Level[level]} ${message}`;
	}
}

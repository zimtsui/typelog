import chalk from 'chalk';

export const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

export const envlevels: Record<string, typeof levels[number]> = {
	debug: 'trace',
	development: 'debug',
	production: 'warn',
};

export function prompt(message: string, channelName: string, level: typeof levels[number], colored = false): string {
	switch (level) {
		case 'warn':
			return `[${new Date().toLocaleString('zh-CN')}] ${channelName} ${colored ? chalk.bgYellow(level) : level} ${message}`;
		case 'error':
			return `[${new Date().toLocaleString('zh-CN')}] ${channelName} ${colored ? chalk.bgRed(level) : level} ${message}`;
		default:
			return `[${new Date().toLocaleString('zh-CN')}] ${channelName} ${colored ? chalk.bgGray(level) : level} ${message}`;
	}
}

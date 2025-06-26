import chalk from 'chalk';

export const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

export const envlevels: Record<string, typeof levels[number]> = {
	debug: 'trace',
	development: 'debug',
	production: 'warn',
};

export function format(message: string, channelName: string, level: typeof levels[number]): string {
	switch (level) {
		case 'warn':
			return `[${new Date().toLocaleString('zh-CN')}] ${chalk.bgYellow(level)} ${channelName ? `${channelName}: ` : ''}${message}`;
		case 'error':
			return `[${new Date().toLocaleString('zh-CN')}] ${chalk.bgRed(level)} ${channelName ? `${channelName}: ` : ''}${message}`;
		default:
			return `[${new Date().toLocaleString('zh-CN')}] ${chalk.bgGray(level)} ${channelName ? `${channelName}: ` : ''}${message}`;
	}
}

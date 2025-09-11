import { Channel } from '@zimtsui/typelog';
import * as Presets from '@zimtsui/typelog/presets';
import { env, stderr } from 'node:process';
import { formatWithOptions } from 'node:util';

const envLevel = Presets.envlevels[env.NODE_ENV ?? ''] ?? Presets.Level.info;

export const channel = Channel.create(
	Presets.Level,
	(message, level) => {
		if (level >= envLevel) console.error(
			Presets.prompt(
				formatWithOptions({ depth: null, colors: stderr.isTTY }, message),
				'Default Channel',
				level,
				stderr.isTTY,
			),
		);
	},
);

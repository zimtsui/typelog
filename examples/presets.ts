import { Channel } from '@zimtsui/typelemetry/log';
import * as Presets from '@zimtsui/typelemetry/log/presets';
import { env, stderr } from 'node:process';
import { formatWithOptions } from 'node:util';

const envLevel = Presets.envlevels[env.NODE_ENV ?? ''] ?? Presets.Level.info;

export const channel = Channel.create(
    Presets.Level,
    (message, level) => {
        if (level >= envLevel) console.error(formatWithOptions({ depth: null, colors: !!stderr.isTTY }, message));
    },
);

import { Channel, Exporter } from '@zimtsui/typelemetry/log';
import * as Presets from '@zimtsui/typelemetry/log/presets';
import { formatWithOptions } from 'node:util';
import { stderr } from 'node:process';

const exporter: Exporter = {
    monolith: ({ payload }) => {
        console.error(formatWithOptions({ depth: null, colors: !!stderr.isTTY }, payload));
    },
    stream: () => {},
};

Exporter.setGlobalExporter(exporter);

const channel = Channel.create(
    Presets.Level,
    (payload, level) => {
        if (level >= Presets.Level.info)
            Exporter.getGlobalExporter().monolith({
                scope: 'Example',
                channel: 'Default',
                payload,
                level: Presets.Level[level],
            });
    },
);

channel.info('Hello, world!');

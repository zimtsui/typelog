import { Exporter } from '@zimtsui/typelog/exporter';
import * as Presets from '@zimtsui/typelog/presets';
import { Channel } from '@zimtsui/typelog';
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
                level,
                scope: 'Example',
                channel: 'Default',
                payload,
            });
	},
);

channel.info('Hello, world!');

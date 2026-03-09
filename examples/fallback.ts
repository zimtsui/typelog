import { exporter } from '@zimtsui/typelog/fallback';
import * as Presets from '@zimtsui/typelog/presets';

exporter.monolith({
    level: Presets.Level.info,
    scope: 'Example',
    channel: 'Default',
    payload: 'Hello, world!',
});

exporter.stream({
    level: Presets.Level.info,
    scope: 'Example',
    channel: 'Default',
    payload: 'Hello, world!',
});

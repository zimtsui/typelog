import test from 'ava';
import * as OTEL from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { Channel, Exporter } from '../../build/log/exports.js';
import type { Message } from '../../build/log/exporter.js';
import * as Presets from '../../build/log/presets/level.js';
import { Stack, Tracer } from '../../build/trace/exports.js';

enum NumericLevel {
    debug,
    info,
    warn,
}

function useTracerProvider() {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const contextManager = new AsyncLocalStorageContextManager();
    OTEL.trace.disable();
    OTEL.context.disable();
    OTEL.propagation.disable();
    provider.register({ contextManager, propagator: null });

    return {
        exporter,
        async cleanup() {
            await provider.shutdown();
            OTEL.context.disable();
            OTEL.trace.disable();
            OTEL.propagation.disable();
        },
    };
}

test.afterEach.always(() => {
    Exporter.setGlobalExporter(new Exporter.Noop());
    OTEL.context.disable();
    OTEL.trace.disable();
    OTEL.propagation.disable();
});

test.serial('Channel.create routes messages by level name', (t) => {
    const calls: Array<{ message: string; level: NumericLevel }> = [];
    const channel = Channel.create(NumericLevel, (message: string, level) => {
        calls.push({ message, level });
    });

    channel.debug('first');
    channel.warn('second');

    t.deepEqual(calls, [
        { message: 'first', level: NumericLevel.debug },
        { message: 'second', level: NumericLevel.warn },
    ]);
});

test.serial('Channel.create rejects unknown properties', (t) => {
    const channel = Channel.create(NumericLevel, () => {});

    const error = t.throws(() => Reflect.get(channel as object, 'missing'));
    t.true(error instanceof Error);
});

test.serial('Exporter global instance is configurable', (t) => {
    const exporter: Exporter = {
        monolith() {},
        stream() {},
    };

    Exporter.setGlobalExporter(exporter);

    t.is(Exporter.getGlobalExporter(), exporter);
});

test.serial('Exporter.Noop accepts arbitrary message payloads', (t) => {
    const exporter: Exporter = new Exporter.Noop();
    const structured = {
        scope: 'scope',
        channel: 'channel',
        payload: { text: 'hello', code: 7 },
        level: 'info',
    } satisfies Message;
    const symbolPayload = {
        scope: 'scope',
        channel: 'channel',
        payload: Symbol.for('payload'),
        level: 'debug',
    } satisfies Message;

    t.notThrows(() => exporter.monolith(structured));
    t.notThrows(() => exporter.stream(symbolPayload));
});

test.serial('level presets expose expected ordering and environment map', (t) => {
    t.is(Presets.Level.trace, 0);
    t.true(Presets.Level.trace < Presets.Level.debug);
    t.true(Presets.Level.error < Presets.Level.critical);
    t.is(Presets.envlevels.debug, Presets.Level.trace);
    t.is(Presets.envlevels.development, Presets.Level.debug);
    t.is(Presets.envlevels.production, Presets.Level.warn);
});

test.serial('Stack prepends names per error instance', (t) => {
    const a = new Error('a');
    const b = new Error('b');

    Stack.prepend(a, 'first');
    Stack.prepend(a, 'second');
    Stack.prepend(b, 'other');

    t.deepEqual(Stack.read(a), ['second', 'first']);
    t.deepEqual(Stack.read(b), ['other']);
    t.deepEqual(Stack.read(new Error('c')), []);
});

test.serial('Stack.run exposes the current nested stack through Stack.now', async (t) => {
    t.deepEqual(Stack.now(), []);

    const outer = Stack.run(() => {
        t.deepEqual(Stack.now(), ['outer']);
        return Stack.run(async () => {
            await Promise.resolve();
            return Stack.now();
        }, 'inner');
    }, 'outer');

    t.deepEqual(await outer, ['outer', 'inner']);
    t.deepEqual(Stack.now(), []);
});

test.serial('Tracer.spawnSync creates a root span and returns callback result', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope', '1.0.0');

    try {
        const value = tracer.spawnSync('root-sync', () => {
            const activeSpan = OTEL.trace.getActiveSpan();
            t.truthy(activeSpan);
            t.is(activeSpan?.spanContext().traceFlags, 1);
            return 42;
        });

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        t.is(value, 42);
        t.is(spans.length, 1);
        t.is(spans[0]?.name, 'root-sync');
        t.is(spans[0]?.parentSpanContext, undefined);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.forkSync creates a child span from the active context', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');

    try {
        tracer.spawnSync('parent', () => {
            tracer.forkSync('child', () => {});
        });

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        const parent = spans.find((span) => span.name === 'parent');
        const child = spans.find((span) => span.name === 'child');

        t.truthy(parent);
        t.truthy(child);
        t.is(child?.parentSpanContext?.spanId, parent?.spanContext().spanId);
        t.is(child?.spanContext().traceId, parent?.spanContext().traceId);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.createSync records errors and appends stack names', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');
    const error = new Error('boom');

    try {
        const thrown = t.throws(() => tracer.spawnSync('failing-sync', () => {
            throw error;
        }));

        await Promise.resolve();

        const [span] = exporter.getFinishedSpans();
        t.is(thrown, error);
        t.deepEqual(Stack.read(error), ['failing-sync']);
        t.is(span?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(span?.events[0]?.name, 'exception');
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.spawnAsync creates a root span for awaited work', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');

    try {
        const value = await tracer.spawnAsync('root-async', async () => {
            await Promise.resolve();
            t.truthy(OTEL.trace.getActiveSpan());
            return 'done';
        });

        await Promise.resolve();

        const [span] = exporter.getFinishedSpans();
        t.is(value, 'done');
        t.is(span?.name, 'root-async');
        t.is(span?.parentSpanContext, undefined);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.forkAsync creates a child span across async boundaries', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');

    try {
        await tracer.spawnAsync('parent-async', async () => {
            await Promise.resolve();
            await tracer.forkAsync('child-async', async () => {
                await Promise.resolve();
            });
        });

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        const parent = spans.find((span) => span.name === 'parent-async');
        const child = spans.find((span) => span.name === 'child-async');

        t.truthy(parent);
        t.truthy(child);
        t.is(child?.parentSpanContext?.spanId, parent?.spanContext().spanId);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.createAsync records errors and appends stack names', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');
    const error = new Error('async boom');

    try {
        const thrown = await t.throwsAsync(async () => tracer.spawnAsync('failing-async', async () => {
            await Promise.resolve();
            throw error;
        }));

        await Promise.resolve();

        const [span] = exporter.getFinishedSpans();
        t.is(thrown, error);
        t.deepEqual(Stack.read(error), ['failing-async']);
        t.is(span?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(span?.events[0]?.name, 'exception');
    } finally {
        await cleanup();
    }
});

test.serial('forkedAsync decorator appends stack names when async method throws', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');
    const error = new Error('decorated async boom');

    try {
        class Service {
            @tracer.forkedAsync()
            public async load(): Promise<void> {
                await Promise.resolve();
                throw error;
            }
        }

        const service = new Service();
        const thrown = await t.throwsAsync(async () => tracer.spawnAsync('parent', async () => {
            await service.load();
        }));

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        const loadSpan = spans.find((span) => span.name === 'load');
        t.is(thrown, error);
        t.deepEqual(Stack.read(error), ['parent', 'load']);
        t.is(loadSpan?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(loadSpan?.events[0]?.name, 'exception');
    } finally {
        await cleanup();
    }
});

test.serial('forked decorators preserve method name and create child spans', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');

    try {
        class Service {
            @tracer.forkedSync()
            public compute(x: number): number {
                return x + 1;
            }

            @tracer.forkedAsync()
            public async load(x: number): Promise<number> {
                await Promise.resolve();
                return x + 2;
            }
        }

        const service = new Service();
        let syncName = '';
        let asyncName = '';
        let result = 0;

        await tracer.spawnAsync('decorator-parent', async () => {
            syncName = service.compute.name;
            result += service.compute(1);
            asyncName = service.load.name;
            result += await service.load(2);
        });

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        const syncSpan = spans.find((span) => span.name === 'compute');
        const asyncSpan = spans.find((span) => span.name === 'load');
        const parent = spans.find((span) => span.name === 'decorator-parent');

        t.is(syncName, 'compute');
        t.is(asyncName, 'load');
        t.is(result, 6);
        t.truthy(syncSpan);
        t.truthy(asyncSpan);
        t.is(syncSpan?.parentSpanContext?.spanId, parent?.spanContext().spanId);
        t.is(asyncSpan?.parentSpanContext?.spanId, parent?.spanContext().spanId);
    } finally {
        await cleanup();
    }
});

test.serial('spawned decorators create root spans and allow custom names', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');

    try {
        class Service {
            @tracer.spawnedSync('custom-sync')
            public compute(): string {
                return 'sync';
            }

            @tracer.spawnedAsync('custom-async')
            public async load(): Promise<string> {
                await Promise.resolve();
                return 'async';
            }
        }

        const service = new Service();
        const sync = service.compute();
        const asyncValue = await service.load();

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        const syncSpan = spans.find((span) => span.name === 'custom-sync');
        const asyncSpan = spans.find((span) => span.name === 'custom-async');

        t.is(sync, 'sync');
        t.is(asyncValue, 'async');
        t.truthy(syncSpan);
        t.truthy(asyncSpan);
        t.is(syncSpan?.parentSpanContext, undefined);
        t.is(asyncSpan?.parentSpanContext, undefined);
        t.is(service.compute.name, 'compute');
        t.is(service.load.name, 'load');
    } finally {
        await cleanup();
    }
});

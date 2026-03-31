import test from 'ava';
import * as OTEL from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { Channel } from '../../build/log/exports.js';
import type { Exporter as GenericExporter, Message } from '../../build/log/exporter.js';
import * as Presets from '../../build/log/presets/exports.js';
import { Stack } from '../../build/trace/stack.js';
import { Tracer } from '../../build/trace/tracer.js';

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
    Presets.Exporter.setGlobalExporter(new Presets.Exporter.Noop());
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

test.serial('preset Exporter global instance is configurable', (t) => {
    const exporter: GenericExporter<typeof Presets.Level> = {
        monolith() {},
        stream() {},
    };

    Presets.Exporter.setGlobalExporter(exporter);

    t.is(Presets.Exporter.getGlobalExporter(), exporter);
});

test.serial('preset Exporter.Noop accepts arbitrary message payloads', (t) => {
    const exporter: GenericExporter<typeof Presets.Level> = new Presets.Exporter.Noop();
    const structured = {
        scope: 'scope',
        channel: 'channel',
        payload: { text: 'hello', code: 7 },
        level: Presets.Level.info,
    } satisfies Message<typeof Presets.Level>;
    const symbolPayload = {
        scope: 'scope',
        channel: 'channel',
        payload: Symbol.for('payload'),
        level: Presets.Level.debug,
    } satisfies Message<typeof Presets.Level>;

    t.notThrows(() => exporter.monolith(structured));
    t.notThrows(() => exporter.stream(symbolPayload));
});

test.serial('level presets barrel exposes expected ordering, environment map, and exporter namespace', (t) => {
    t.is(Presets.Level.trace, 0);
    t.true(Presets.Level.trace < Presets.Level.debug);
    t.true(Presets.Level.error < Presets.Level.critical);
    t.is(Presets.envlevels.debug, Presets.Level.trace);
    t.is(Presets.envlevels.development, Presets.Level.debug);
    t.is(Presets.envlevels.production, Presets.Level.warn);
    t.true(Presets.Exporter.getGlobalExporter() instanceof Presets.Exporter.Noop);
});

test.serial('Stack tracks nested frames and current frame', async (t) => {
    const stack = new Stack();

    t.deepEqual(stack.getFrames(), []);
    t.is(stack.getFrame(), undefined);

    const outer = stack.run('outer', () => {
        t.deepEqual(stack.getFrames(), [{ name: 'outer', attrs: {} }]);
        t.deepEqual(stack.getFrame(), { name: 'outer', attrs: {} });

        return stack.run('inner', async () => {
            await Promise.resolve();
            t.deepEqual(
                stack.getFrames().map((frame) => frame.name),
                ['outer', 'inner'],
            );
            t.is(stack.getFrame()?.name, 'inner');
            return stack.getFrames();
        });
    });

    t.deepEqual(
        (await outer).map((frame) => frame.name),
        ['outer', 'inner'],
    );
    t.deepEqual(stack.getFrames(), []);
    t.is(stack.getFrame(), undefined);
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

test.serial('Tracer.createSync injects extracted frames into errors', async (t) => {
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
        t.deepEqual(tracer.extract(error), [{ name: 'failing-sync', attrs: {} }]);
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

test.serial('Tracer.createAsync injects extracted frames into errors', async (t) => {
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
        t.deepEqual(tracer.extract(error), [{ name: 'failing-async', attrs: {} }]);
        t.is(span?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(span?.events[0]?.name, 'exception');
    } finally {
        await cleanup();
    }
});

test.serial('forkedAsync decorator injects nested frames when async method throws', async (t) => {
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
        t.deepEqual(
            tracer.extract(error).map((frame) => frame.name),
            ['parent', 'load'],
        );
        t.is(loadSpan?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(loadSpan?.events[0]?.name, 'exception');
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.setAttr writes to the active span and extracted frames', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');
    const error = new Error('attr boom');

    try {
        const thrown = t.throws(() => tracer.spawnSync('outer', () => {
            tracer.setAttr('request.id', 'r1');
            return tracer.forkSync('inner', () => {
                tracer.setAttr('user.id', 7);
                throw error;
            });
        }));

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        const outerSpan = spans.find((span) => span.name === 'outer');
        const innerSpan = spans.find((span) => span.name === 'inner');

        t.is(thrown, error);
        t.deepEqual(tracer.extract(error), [
            { name: 'outer', attrs: { 'request.id': 'r1' } },
            { name: 'inner', attrs: { 'user.id': 7 } },
        ]);
        t.is(outerSpan?.attributes['request.id'], 'r1');
        t.is(innerSpan?.attributes['user.id'], 7);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.getFrames exposes the current nested frame stack', async (t) => {
    const { cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');

    try {
        t.deepEqual(tracer.getFrames(), []);

        const names = await tracer.spawnAsync('outer', async () => {
            tracer.setAttr('outer.attr', true);
            return tracer.forkAsync('inner', async () => {
                await Promise.resolve();
                const frames = tracer.getFrames();
                t.deepEqual(frames, [
                    { name: 'outer', attrs: { 'outer.attr': true } },
                    { name: 'inner', attrs: {} },
                ]);
                return frames.map((frame) => frame.name);
            });
        });

        t.deepEqual(names, ['outer', 'inner']);
        t.deepEqual(tracer.getFrames(), []);
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

test.serial('Tracer.hookSync resumes a generator inside forked spans', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');

    try {
        const activeSpanNames: string[] = [];
        function* source(): Generator<string, string, string> {
            activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
            tracer.setAttr('step', 'first');
            const first = yield 'one';
            activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
            tracer.setAttr('input', first);
            try {
                yield `two:${first}`;
            } catch (e) {
                activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
                tracer.setAttr('error', e instanceof Error ? e.message : 'unknown');
            }
            return 'done';
        }

        const hooked = tracer.spawnSync('parent', () => tracer.hookSync('hook-sync', source()));
        const first = hooked.next();
        const second = hooked.next('value');
        const third = hooked.throw(new Error('boom'));

        await Promise.resolve();

        const spans = exporter.getFinishedSpans().filter((span) => span.name === 'hook-sync');
        t.deepEqual(first, { value: 'one', done: false });
        t.deepEqual(second, { value: 'two:value', done: false });
        t.deepEqual(third, { value: 'done', done: true });
        t.is(activeSpanNames.length, 3);
        t.true(activeSpanNames.every(Boolean));
        t.is(spans.length, 3);
        t.deepEqual(spans.map((span) => span.attributes), [
            { step: 'first' },
            { input: 'value' },
            { error: 'boom' },
        ]);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.hookAsync resumes an async generator inside forked spans', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = Tracer.create('scope');

    try {
        const activeSpanNames: string[] = [];
        async function* source(): AsyncGenerator<string, string, string> {
            await Promise.resolve();
            activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
            tracer.setAttr('phase', 'first');
            const first = yield 'alpha';
            await Promise.resolve();
            activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
            tracer.setAttr('input', first);
            try {
                yield `beta:${first}`;
            } catch (e) {
                await Promise.resolve();
                activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
                tracer.setAttr('error', e instanceof Error ? e.message : 'unknown');
            }
            return 'done';
        }

        const hooked = await tracer.spawnAsync('parent-async', async () => tracer.hookAsync('hook-async', source()));
        const first = await hooked.next();
        const second = await hooked.next('value');
        const third = await hooked.throw(new Error('boom'));

        await Promise.resolve();

        const spans = exporter.getFinishedSpans().filter((span) => span.name === 'hook-async');
        t.deepEqual(first, { value: 'alpha', done: false });
        t.deepEqual(second, { value: 'beta:value', done: false });
        t.deepEqual(third, { value: 'done', done: true });
        t.is(activeSpanNames.length, 3);
        t.true(activeSpanNames.every(Boolean));
        t.is(spans.length, 3);
        t.deepEqual(spans.map((span) => span.attributes), [
            { phase: 'first' },
            { input: 'value' },
            { error: 'boom' },
        ]);
    } finally {
        await cleanup();
    }
});

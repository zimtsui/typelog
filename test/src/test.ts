import test from 'ava';
import * as OTEL from '@opentelemetry/api';
import * as OTEL_LOGS from '@opentelemetry/api-logs';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { LevelMap } from '../../build/logs/level.js';
import { LoggerProvider } from '../../build/logs/provider.js';
import type { Preprocessor } from '../../build/logs/preprocessor.js';
import * as Presets from '../../build/logs/presets/exports.js';
import { Tracer } from '../../build/trace/tracer.js';
import { SpanStack } from '../../build/trace/span-stack.js';

const numericLevelMap = {
    debug: 5,
    info: 9,
    warn: 13,
} as const;

function readLevelValue(levelMap: LevelMap.Proto, level: string) {
    return levelMap[level];
}

function invokePreprocessorNext(next: Preprocessor.Next, body: OTEL_LOGS.AnyValue) {
    next(body);
}

function snapshotSpanFrames() {
    return Tracer.getSpanFrames().map((frame) => ({
        name: frame.name,
        attrs: { ...frame.attrs },
    }));
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

function useNoopLogProvider() {
    const provider: OTEL_LOGS.LoggerProvider = {
        getLogger() {
            return {
                emit() {},
                enabled() {
                    return true;
                },
            };
        },
    };
    OTEL_LOGS.logs.disable();
    OTEL_LOGS.logs.setGlobalLoggerProvider(provider);

    return {
        cleanup() {
            OTEL_LOGS.logs.disable();
        },
    };
}

test.afterEach.always(() => {
    OTEL_LOGS.logs.disable();
    OTEL.context.disable();
    OTEL.trace.disable();
    OTEL.propagation.disable();
});

test.serial('LoggerProvider.getLogger passes raw messages and level metadata to preprocessors', (t) => {
    const { cleanup } = useNoopLogProvider();
    const rawDebug = { text: 'first', skipped: Symbol('debug') };
    const rawWarn = { text: 'second', skipped: Symbol('warn') };
    const seen: Preprocessor.Data[] = [];
    const serializedBodies: unknown[] = [];
    const preprocessor: Preprocessor<typeof numericLevelMap> = (data, next) => {
        seen.push({ ...data, attributes: { ...data.attributes } });
        const json = JSON.stringify(data.message);
        serializedBodies.push(json === undefined ? undefined : JSON.parse(json));
        next(null);
    };

    try {
        const provider = new LoggerProvider(numericLevelMap);
        provider.addPreprocessor(preprocessor);
        const logger = provider.getLogger<{ text: string; skipped: symbol }>('scope', 'evt');

        logger.debug(rawDebug);
        logger.warn(rawWarn, { requestId: 'r-1' });

        t.is(seen.length, 2);
        t.deepEqual(seen.map((item) => item.levelText), ['debug', 'warn']);
        t.deepEqual(seen.map((item) => item.levelNumber), [numericLevelMap.debug, numericLevelMap.warn]);
        t.true(seen.every((item) => item.scopeName === 'scope'));
        t.true(seen.every((item) => item.eventName === 'evt'));
        t.is(seen[0]?.message, rawDebug);
        t.is(seen[1]?.message, rawWarn);
        t.deepEqual(seen.map((item) => item.attributes), [{}, { requestId: 'r-1' }]);
        t.true(seen.every((item) => Number.isFinite(item.observedTimestampMs)));
        t.deepEqual(serializedBodies, [{ text: 'first' }, { text: 'second' }]);
    } finally {
        cleanup();
    }
});

test.serial('LoggerProvider.getLogger rejects unknown properties', (t) => {
    const { cleanup } = useNoopLogProvider();

    try {
        const provider = new LoggerProvider(numericLevelMap);
        const logger = provider.getLogger('scope');

        const error = t.throws(() => Reflect.get(logger as object, 'missing'));
        t.true(error instanceof Error);
    } finally {
        cleanup();
    }
});

test.serial('LoggerProvider runs every preprocessor with the same log data', (t) => {
    const { cleanup } = useNoopLogProvider();
    const seen: Array<{ index: number; data: Preprocessor.Data }> = [];
    const rawMessage = { ok: true, skipped: Symbol('raw') };
    const serializedBodies: unknown[] = [];
    const first: Preprocessor<typeof numericLevelMap> = (data, next) => {
        seen.push({ index: 1, data: { ...data, attributes: { ...data.attributes } } });
        const json = JSON.stringify(data.message);
        serializedBodies.push(json === undefined ? undefined : JSON.parse(json));
        next(null);
    };
    const second: Preprocessor<typeof numericLevelMap> = (data, next) => {
        seen.push({ index: 2, data: { ...data, attributes: { ...data.attributes } } });
        const json = JSON.stringify(data.message);
        serializedBodies.push(json === undefined ? undefined : JSON.parse(json));
        next(null);
    };

    try {
        const provider = new LoggerProvider(numericLevelMap);
        provider.addPreprocessor(first);
        provider.addPreprocessor(second);
        const logger = provider.getLogger<typeof rawMessage>('scope', 'evt');

        logger.info(rawMessage, { requestId: 'r-2' });

        t.is(seen.length, 2);
        t.deepEqual(seen.map((item) => item.index), [1, 2]);
        t.true(seen.every((item) => item.data.scopeName === 'scope'));
        t.true(seen.every((item) => item.data.eventName === 'evt'));
        t.true(seen.every((item) => item.data.levelText === 'info'));
        t.true(seen.every((item) => item.data.levelNumber === numericLevelMap.info));
        t.true(seen.every((item) => item.data.message === rawMessage));
        t.true(seen.every((item) => item.data.attributes.requestId === 'r-2'));
        t.true(seen.every((item) => Number.isFinite(item.data.observedTimestampMs)));
        t.deepEqual(serializedBodies, [{ ok: true }, { ok: true }]);
    } finally {
        cleanup();
    }
});

test.serial('level presets barrel exposes expected ordering and provider exports', (t) => {
    t.is(Presets.levelMap.trace, 1);
    t.true(Presets.levelMap.trace < Presets.levelMap.debug);
    t.true(Presets.levelMap.error < Presets.levelMap.critical);
    t.is(typeof Presets.preprocessor, 'function');
    t.is(typeof Presets.loggerProvider.getLogger, 'function');
    t.is(readLevelValue(Presets.levelMap, 'debug'), Presets.levelMap.debug);
});

test.serial('Preprocessor.Next accepts OTEL serializable bodies', (t) => {
    const seen: OTEL_LOGS.AnyValue[] = [];

    const next: Preprocessor.Next = body => {
        seen.push(body);
    };

    invokePreprocessorNext(next, {
        stringValue: 'serialized',
    });

    t.deepEqual(seen, [{ stringValue: 'serialized' }]);
});

test.serial('SpanStack tracks nested frames and current frame', async (t) => {
    const stack = SpanStack.getInstance();

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
    const tracer = new Tracer('scope');

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
    const tracer = new Tracer('scope');

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

test.serial('Tracer.spawnSync injects extracted frames into errors', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');
    const error = new Error('boom');

    try {
        const thrown = t.throws(() => tracer.spawnSync(
            'failing-sync',
            () => {
                throw error;
            },
            { 'request.id': 'sync-1' },
        ));

        await Promise.resolve();

        const [span] = exporter.getFinishedSpans();
        t.is(thrown, error);
        t.deepEqual(Tracer.extractErrorSpanFrames(error), [{ name: 'failing-sync', attrs: { 'request.id': 'sync-1' } }]);
        t.is(span?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(span?.events[0]?.name, 'exception');
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.spawnAsync creates a root span for awaited work', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');

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

test.serial('Tracer spawn and fork apply initial attributes to created spans', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');

    try {
        await tracer.spawnAsync('root-with-attrs', async () => {
            await tracer.forkAsync('child-with-attrs', async () => {
                await Promise.resolve();
            }, { 'child.kind': 'worker', 'child.index': 2 });
        }, { 'root.kind': 'entry', 'root.index': 1 });

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        const root = spans.find((span) => span.name === 'root-with-attrs');
        const child = spans.find((span) => span.name === 'child-with-attrs');

        t.truthy(root);
        t.truthy(child);
        t.is(root?.attributes['root.kind'], 'entry');
        t.is(root?.attributes['root.index'], 1);
        t.is(child?.attributes['child.kind'], 'worker');
        t.is(child?.attributes['child.index'], 2);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.forkAsync creates a child span across async boundaries', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');

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

test.serial('Tracer.spawnAsync injects extracted frames into errors', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');
    const error = new Error('async boom');

    try {
        const thrown = await t.throwsAsync(async () => tracer.spawnAsync(
            'failing-async',
            async () => {
                await Promise.resolve();
                throw error;
            },
            { 'request.id': 'async-1' },
        ));

        await Promise.resolve();

        const [span] = exporter.getFinishedSpans();
        t.is(thrown, error);
        t.deepEqual(Tracer.extractErrorSpanFrames(error), [{ name: 'failing-async', attrs: { 'request.id': 'async-1' } }]);
        t.is(span?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(span?.events[0]?.name, 'exception');
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.extractErrorSpanFrames preserves the throw-site span stack', async (t) => {
    const { cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');
    let throwSiteFrames: ReturnType<typeof snapshotSpanFrames> = [];

    try {
        const thrown = t.throws(() => tracer.spawnSync(
            'outer',
            () => {
                Tracer.setSpanAttribute('request.id', 'req-1');
                return tracer.forkSync('inner', () => {
                    Tracer.setSpanAttribute('step', 'throw');
                    const error = new Error('created and thrown inside inner');
                    throwSiteFrames = snapshotSpanFrames();
                    throw error;
                }, { 'inner.kind': 'child' });
            },
            { 'outer.kind': 'root' },
        ));

        await Promise.resolve();

        t.deepEqual(throwSiteFrames, [
            { name: 'outer', attrs: { 'outer.kind': 'root', 'request.id': 'req-1' } },
            { name: 'inner', attrs: { 'inner.kind': 'child', step: 'throw' } },
        ]);
        t.deepEqual(Tracer.extractErrorSpanFrames(thrown), throwSiteFrames);
        t.deepEqual(Tracer.getSpanFrames(), []);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer records thrown errors on sync and async spans', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');
    const syncError = new TypeError('sync boom');
    const asyncError = new RangeError('async boom');

    try {
        t.throws(() => tracer.spawnSync('sync-error', () => {
            throw syncError;
        }), { is: syncError });

        await t.throwsAsync(async () => tracer.spawnAsync('async-error', async () => {
            await Promise.resolve();
            throw asyncError;
        }), { is: asyncError });

        await Promise.resolve();

        const syncSpan = exporter.getFinishedSpans().find((span) => span.name === 'sync-error');
        const asyncSpan = exporter.getFinishedSpans().find((span) => span.name === 'async-error');
        const syncException = syncSpan?.events.find((event) => event.name === 'exception');
        const asyncException = asyncSpan?.events.find((event) => event.name === 'exception');

        t.is(syncSpan?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(asyncSpan?.status.code, OTEL.SpanStatusCode.ERROR);
        t.truthy(syncException?.attributes);
        t.truthy(asyncException?.attributes);
        t.is(syncException?.attributes?.['exception.type'], 'TypeError');
        t.is(syncException?.attributes?.['exception.message'], 'sync boom');
        t.regex(String(syncException?.attributes?.['exception.stacktrace']), /TypeError: sync boom/);
        t.is(asyncException?.attributes?.['exception.type'], 'RangeError');
        t.is(asyncException?.attributes?.['exception.message'], 'async boom');
        t.regex(String(asyncException?.attributes?.['exception.stacktrace']), /RangeError: async boom/);
    } finally {
        await cleanup();
    }
});

test.serial('forkedAsync decorator injects nested frames when async method throws', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');
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
            Tracer.extractErrorSpanFrames(error).map((frame) => frame.name),
            ['parent', 'load'],
        );
        t.is(loadSpan?.status.code, OTEL.SpanStatusCode.ERROR);
        t.is(loadSpan?.events[0]?.name, 'exception');
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.setSpanAttribute writes to the active span and extracted frames', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');
    const error = new Error('attr boom');

    try {
        const thrown = t.throws(() => tracer.spawnSync('outer', () => {
            Tracer.setSpanAttribute('request.id', 'r1');
            return tracer.forkSync('inner', () => {
                Tracer.setSpanAttribute('user.id', 7);
                throw error;
            });
        }));

        await Promise.resolve();

        const spans = exporter.getFinishedSpans();
        const outerSpan = spans.find((span) => span.name === 'outer');
        const innerSpan = spans.find((span) => span.name === 'inner');

        t.is(thrown, error);
        t.deepEqual(Tracer.extractErrorSpanFrames(error), [
            { name: 'outer', attrs: { 'request.id': 'r1' } },
            { name: 'inner', attrs: { 'user.id': 7 } },
        ]);
        t.is(outerSpan?.attributes['request.id'], 'r1');
        t.is(innerSpan?.attributes['user.id'], 7);
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.getSpanFrames exposes the current nested frame stack', async (t) => {
    const { cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');

    try {
        t.deepEqual(Tracer.getSpanFrames(), []);

        const names = await tracer.spawnAsync('outer', async () => {
            Tracer.setSpanAttribute('outer.attr', true);
            return tracer.forkAsync('inner', async () => {
                await Promise.resolve();
                const frames = Tracer.getSpanFrames();
                t.deepEqual(frames, [
                    { name: 'outer', attrs: { 'outer.kind': 'root', 'outer.attr': true } },
                    { name: 'inner', attrs: { 'inner.kind': 'child' } },
                ]);
                return frames.map((frame) => frame.name);
            }, { 'inner.kind': 'child' });
        }, { 'outer.kind': 'root' });

        t.deepEqual(names, ['outer', 'inner']);
        t.deepEqual(Tracer.getSpanFrames(), []);
    } finally {
        await cleanup();
    }
});

test.serial('forked decorators preserve method name and create child spans', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');

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
    const tracer = new Tracer('scope');

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
    const tracer = new Tracer('scope');

    try {
        const activeSpanNames: string[] = [];
        function* source(): Generator<string, string, string> {
            activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
            Tracer.setSpanAttribute('step', 'first');
            const first = yield 'one';
            activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
            Tracer.setSpanAttribute('input', first);
            try {
                yield `two:${first}`;
            } catch (e) {
                activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
                Tracer.setSpanAttribute('error', e instanceof Error ? e.message : 'unknown');
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

test.serial('Tracer.hookSync and hookAsync apply initial attributes on every resumed span', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');

    try {
        function* syncSource(): Generator<string, string, string> {
            const first = yield 'sync';
            return first;
        }

        async function* asyncSource(): AsyncGenerator<string, string, string> {
            const first = yield 'async';
            return first;
        }

        const hookedSync = tracer.spawnSync(
            'sync-parent',
            () => tracer.hookSync('hook-sync-attrs', syncSource(), { 'hook.kind': 'sync' }),
        );
        const syncFirst = hookedSync.next();
        const syncSecond = hookedSync.next('done-sync');

        const hookedAsync = await tracer.spawnAsync(
            'async-parent',
            async () => tracer.hookAsync('hook-async-attrs', asyncSource(), { 'hook.kind': 'async' }),
        );
        const asyncFirst = await hookedAsync.next();
        const asyncSecond = await hookedAsync.next('done-async');

        await Promise.resolve();

        const syncSpans = exporter.getFinishedSpans().filter((span) => span.name === 'hook-sync-attrs');
        const asyncSpans = exporter.getFinishedSpans().filter((span) => span.name === 'hook-async-attrs');

        t.deepEqual(syncFirst, { value: 'sync', done: false });
        t.deepEqual(syncSecond, { value: 'done-sync', done: true });
        t.deepEqual(asyncFirst, { value: 'async', done: false });
        t.deepEqual(asyncSecond, { value: 'done-async', done: true });
        t.is(syncSpans.length, 2);
        t.is(asyncSpans.length, 2);
        t.true(syncSpans.every((span) => span.attributes['hook.kind'] === 'sync'));
        t.true(asyncSpans.every((span) => span.attributes['hook.kind'] === 'async'));
    } finally {
        await cleanup();
    }
});

test.serial('Tracer.hookAsync resumes an async generator inside forked spans', async (t) => {
    const { exporter, cleanup } = useTracerProvider();
    const tracer = new Tracer('scope');

    try {
        const activeSpanNames: string[] = [];
        async function* source(): AsyncGenerator<string, string, string> {
            await Promise.resolve();
            activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
            Tracer.setSpanAttribute('phase', 'first');
            const first = yield 'alpha';
            await Promise.resolve();
            activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
            Tracer.setSpanAttribute('input', first);
            try {
                yield `beta:${first}`;
            } catch (e) {
                await Promise.resolve();
                activeSpanNames.push(OTEL.trace.getActiveSpan()?.spanContext().spanId ?? '');
                Tracer.setSpanAttribute('error', e instanceof Error ? e.message : 'unknown');
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

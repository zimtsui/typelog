import test, { type ExecutionContext } from 'ava';
import * as OTEL from '@opentelemetry/api';
import { Channel } from './channel.ts';
import { LogEvent } from './log-events.ts';
import { Level, envlevels } from './presets.ts';
import { Tracer } from './trace.ts';

function withMockOtel(t: ExecutionContext) {
	const originalGetTracer = OTEL.trace.getTracer;
	const originalSetSpan = OTEL.trace.setSpan;
	const originalContextWith = OTEL.context.with;
	const originalContextActive = OTEL.context.active;

	t.teardown(() => {
		OTEL.trace.getTracer = originalGetTracer;
		OTEL.trace.setSpan = originalSetSpan;
		OTEL.context.with = originalContextWith;
		OTEL.context.active = originalContextActive;
	});
}

function runWithMockContext<A extends unknown[], R>(
	_context: OTEL.Context,
	fn: (...args: A) => R,
	thisArg?: ThisParameterType<typeof fn>,
	...args: A
): R {
	return fn.apply(thisArg, args);
}

test('Channel.create forwards message and level', (t) => {
	enum TestLevel {
		trace,
		info,
	}

	const seen: Array<[string, TestLevel]> = [];
	const channel = Channel.create(TestLevel, (message: string, level) => {
		seen.push([message, level]);
	});

	channel.trace('hello');
	channel.info('world');

	t.deepEqual(seen, [
		['hello', TestLevel.trace],
		['world', TestLevel.info],
	]);
});

test('Channel.create skips handler when signal is aborted', (t) => {
	enum TestLevel {
		trace,
	}

	const controller = new AbortController();
	let called = 0;
	const channel = Channel.create(TestLevel, () => {
		called += 1;
	}, controller.signal);

	controller.abort();
	channel.trace('ignored');

	t.is(called, 0);
});

test('Channel.create throws on unknown level access', (t) => {
	enum TestLevel {
		trace,
	}

	const channel = Channel.create(TestLevel, () => {});

	t.throws(() => {
		const unknownLevel = (channel as unknown as Record<string, unknown>).oops as (message: string) => void;
		return unknownLevel('x');
	}, {
		instanceOf: Error,
	});
});

test('Channel.transport forwards messages until aborted', (t) => {
	const controller = new AbortController();
	const seen: string[] = [];
	const transport = Channel.transport<string>((message) => {
		seen.push(message);
	}, controller.signal);

	transport('before');
	controller.abort();
	transport('after');

	t.deepEqual(seen, ['before']);
});

test('Channel.attach dispatches LogEvent with type, level and detail', (t) => {
	const eventTarget = new EventTarget();
	const channel = Channel.attach(eventTarget, 'log', Level) as {
		warn: (message: number) => boolean;
	};
	let received: LogEvent<'log', typeof Level, number> | undefined;

	eventTarget.addEventListener('log', (event) => {
		received = event as LogEvent<'log', typeof Level, number>;
	});

	const result = channel.warn(42);

	t.true(result);
	t.truthy(received);
	t.is(received?.type, 'log');
	t.is(received?.level, Level.warn);
	t.is(received?.detail, 42);
});

test('Channel.attach skips dispatch when signal is aborted', (t) => {
	const controller = new AbortController();
	const eventTarget = new EventTarget();
	const channel = Channel.attach(eventTarget, 'log', Level, controller.signal) as {
		error: (message: string) => boolean;
	};
	let received = 0;

	eventTarget.addEventListener('log', () => {
		received += 1;
	});

	controller.abort();
	const result = channel.error('ignored');

	t.is(received, 0);
	t.true(result);
});

test('LogEvent stores event metadata on the instance', (t) => {
	const payload = { answer: 42 };
	const event = new LogEvent('message', Level.info, payload);

	t.is(event.type, 'message');
	t.is(event.level, Level.info);
	t.deepEqual(event.detail, payload);
});

test('presets.envlevels expose documented defaults', (t) => {
	t.is(envlevels.debug, Level.trace);
	t.is(envlevels.development, Level.debug);
	t.is(envlevels.production, Level.warn);
});

test('Tracer.create requests OTEL tracer with scope and version', (t) => {
	withMockOtel(t);

	const calls: Array<[string, string | undefined]> = [];
	OTEL.trace.getTracer = (scope, version) => {
		calls.push([scope, version]);
		return { startSpan() { throw new Error('unused'); } } as unknown as OTEL.Tracer;
	};

	Tracer.create('scope', '1.2.3');

	t.deepEqual(calls, [['scope', '1.2.3']]);
});

test('Tracer.forkSync runs inside active context and ends the span', (t) => {
	withMockOtel(t);

	const masterContext = { name: 'active' } as unknown as OTEL.Context;
	const slaveContext = { name: 'slave' } as unknown as OTEL.Context;
	const seen: string[] = [];
	const span = {
		recordException() {},
		setStatus() {},
		end() {
			seen.push('end');
		},
	} as unknown as OTEL.Span;

	OTEL.context.active = () => masterContext;
	OTEL.trace.getTracer = () => ({
		startSpan(name, _options, context) {
			seen.push(`start:${name}`);
			t.is(context, masterContext);
			return span;
		},
	} as OTEL.Tracer);
	OTEL.trace.setSpan = (context, currentSpan) => {
		seen.push('setSpan');
		t.is(context, masterContext);
		t.is(currentSpan, span);
		return slaveContext;
	};
	OTEL.context.with = (context, fn, thisArg, ...args) => {
		seen.push('with');
		t.is(context, slaveContext);
		return runWithMockContext(context, fn, thisArg, ...args);
	};

	const tracer = Tracer.create('scope');
	const result = tracer.forkSync('sync-op', () => {
		seen.push('body');
		return 42;
	});

	t.is(result, 42);
	t.deepEqual(seen, ['start:sync-op', 'setSpan', 'with', 'body', 'end']);
});

test('Tracer.spawnSync records errors, marks span and rethrows', (t) => {
	withMockOtel(t);

	const statuses: OTEL.SpanStatus[] = [];
	const errors: unknown[] = [];
	const span = {
		recordException(error: unknown) {
			errors.push(error);
		},
		setStatus(status: OTEL.SpanStatus) {
			statuses.push(status);
		},
		end() {},
	} as unknown as OTEL.Span;

	OTEL.trace.getTracer = () => ({
		startSpan() {
			return span;
		},
	} as unknown as OTEL.Tracer);
	OTEL.trace.setSpan = (context) => context;
	OTEL.context.with = (_context, fn, thisArg, ...args) => runWithMockContext(_context, fn, thisArg, ...args);

	const tracer = Tracer.create('scope');
	const boom = new Error('boom');

	const thrown = t.throws(() => tracer.spawnSync('sync-op', () => {
		throw boom;
	}));

	t.is(thrown, boom);
	t.is(errors[0], boom);
	t.deepEqual(statuses, [{ code: OTEL.SpanStatusCode.ERROR }]);
});

test('Tracer.forkAsync waits for the promise before ending the span', async (t) => {
	withMockOtel(t);

	const masterContext = { name: 'active' } as unknown as OTEL.Context;
	const slaveContext = { name: 'slave' } as unknown as OTEL.Context;
	const seen: string[] = [];
	let resolveWork: ((value: number) => void) | undefined;
	const work = new Promise<number>((resolve) => {
		resolveWork = resolve;
	});

	const span = {
		recordException() {},
		setStatus() {},
		end() {
			seen.push('end');
		},
	} as unknown as OTEL.Span;

	OTEL.context.active = () => masterContext;
	OTEL.trace.getTracer = () => ({
		startSpan(name, _options, context) {
			seen.push(`start:${name}`);
			t.is(context, masterContext);
			return span;
		},
	} as OTEL.Tracer);
	OTEL.trace.setSpan = (context, currentSpan) => {
		seen.push('setSpan');
		t.is(context, masterContext);
		t.is(currentSpan, span);
		return slaveContext;
	};
	OTEL.context.with = (context, fn, thisArg, ...args) => {
		seen.push('with');
		t.is(context, slaveContext);
		return runWithMockContext(context, fn, thisArg, ...args);
	};

	const tracer = Tracer.create('scope');
	const pending = tracer.forkAsync('async-op', async () => {
		seen.push('body');
		return await work;
	});

	await Promise.resolve();
	t.deepEqual(seen, ['start:async-op', 'setSpan', 'with', 'body']);

	resolveWork!(7);
	t.is(await pending, 7);
	t.deepEqual(seen, ['start:async-op', 'setSpan', 'with', 'body', 'end']);
});

test('Tracer.spawnAsync records async rejections, marks span and rethrows', async (t) => {
	withMockOtel(t);

	const statuses: OTEL.SpanStatus[] = [];
	const errors: unknown[] = [];
	const span = {
		recordException(error: unknown) {
			errors.push(error);
		},
		setStatus(status: OTEL.SpanStatus) {
			statuses.push(status);
		},
		end() {},
	} as unknown as OTEL.Span;

	OTEL.trace.getTracer = () => ({
		startSpan() {
			return span;
		},
	} as unknown as OTEL.Tracer);
	OTEL.trace.setSpan = (context) => context;
	OTEL.context.with = (_context, fn, thisArg, ...args) => runWithMockContext(_context, fn, thisArg, ...args);

	const tracer = Tracer.create('scope');
	const boom = new Error('boom-async');

	const thrown = await t.throwsAsync(async () => tracer.spawnAsync('async-op', async () => {
		throw boom;
	}));

	t.is(thrown, boom);
	t.is(errors[0], boom);
	t.deepEqual(statuses, [{ code: OTEL.SpanStatusCode.ERROR }]);
});

test('Tracer decorators preserve method names, this binding and configured span names', async (t) => {
	withMockOtel(t);

	const spanNames: string[] = [];
	const span = {
		recordException() {},
		setStatus() {},
		end() {},
	} as unknown as OTEL.Span;

	OTEL.trace.getTracer = () => ({
		startSpan(name: string) {
			spanNames.push(name);
			return span;
		},
	} as unknown as OTEL.Tracer);
	OTEL.trace.setSpan = (context) => context;
	OTEL.context.with = (_context, fn, thisArg, ...args) => runWithMockContext(_context, fn, thisArg, ...args);
	OTEL.context.active = () => OTEL.ROOT_CONTEXT;

	const tracer = Tracer.create('scope');

	class Demo {
		public constructor(private readonly base: number) {}

		@tracer.forkedSync()
		public add(delta: number) {
			return this.base + delta;
		}

		@tracer.spawnedAsync('custom-async')
		public async addAsync(delta: number) {
			return this.base + delta;
		}
	}

	const demo = new Demo(10);

	t.is(demo.add.name, 'add');
	t.is(demo.add(2), 12);
	t.is(await demo.addAsync(5), 15);
	t.deepEqual(spanNames, ['add', 'custom-async']);
});

import test from 'ava';
import { Channel } from './channel.ts';
import { LogEvent, type LogEventTarget } from './log-events.ts';
import { Level, envlevels, prompt } from './presets.ts';

test('Channel.create forwards message and level', (t) => {
	enum LevelLocal {
		trace,
		info,
	}
	const seen: Array<[string, LevelLocal]> = [];
	const channel = Channel.create<typeof LevelLocal, string>(
		LevelLocal,
		(message, level) => {
			seen.push([message, level]);
		},
	);

	channel.trace('hello');
	channel.info('world');

	t.deepEqual(seen, [
		['hello', LevelLocal.trace],
		['world', LevelLocal.info],
	]);
});

test('Channel.create throws on unknown level access', (t) => {
	enum LevelLocal {
		trace,
		info,
	}
	const channel = Channel.create<typeof LevelLocal, string>(LevelLocal, () => {});

	t.throws(() => (channel as any).oops('x'), { instanceOf: Error });
});

test('Channel.attach dispatches LogEvent with level and detail', (t) => {
	type MyMap = {
		log: [typeof Level, number];
	};
	const eventTarget = new EventTarget() as LogEventTarget<MyMap>;
	const channel = Channel.attach(eventTarget, 'log', Level);

	let received: LogEvent<'log', typeof Level, number> | undefined;
	eventTarget.addEventListener('log', (evt) => {
		received = evt;
	});

	channel.warn(42);

	t.truthy(received);
	t.is(received?.type, 'log');
	t.is(received?.level, Level.warn);
	t.is(received?.detail, 42);
});

test('LogEvent stores type, level and detail', (t) => {
	const payload = { value: 123 };
	const evt = new LogEvent('evt', Level.info, payload);

	t.is(evt.type, 'evt');
	t.is(evt.level, Level.info);
	t.deepEqual(evt.detail, payload);
});

test('presets.envlevels maps environments to expected levels', (t) => {
	t.is(envlevels.debug, Level.trace);
	t.is(envlevels.development, Level.debug);
	t.is(envlevels.production, Level.warn);
});

test('presets.prompt includes channel, level and message', (t) => {
	const result = prompt('hello', 'Chan', Level.info, false);

	t.true(result.startsWith('['));
	t.true(result.includes('Chan'));
	t.true(result.includes('info'));
	t.true(result.includes('hello'));
});

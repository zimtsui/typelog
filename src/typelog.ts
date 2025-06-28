export type Channel<levels extends readonly string[] = readonly never[], message = unknown> = {
	[level in levels[number]]: (message: message) => void;
};

export interface Channels {
	[channelId: string]: readonly [levels: readonly string[], message: unknown];
}

export type Logger<channels extends Channels> = {
	[channelId in keyof channels]: Channel<channels[channelId][0], channels[channelId][1]>;
};

export namespace Channel {
	export class Definition<levels extends readonly string[] = readonly never[], message = unknown> {
		public constructor(
			private levels: levels,
			private level: levels[number],
			private f: (message: message, level: levels[number]) => void,
		) {}
		public log(level: levels[number], message: message): void {
			if (this.levels.findIndex(l => l === level) >= this.levels.findIndex(l => l === this.level)) this.f(message, level);
		}
	}
	export function create<levels extends readonly string[] = readonly never[], message = unknown>(
		levels: levels,
		level: levels[number],
		f: (message: message, level: levels[number]) => void,
	) {
		const definition = new Definition<levels, message>(levels, level, f);
		return new Proxy({} as Channel<levels, message>, {
			get(target, prop) {
				if (levels.includes(prop as levels[number])) return (message: message) => definition.log(prop as levels[number], message);
				throw new Error();
			},
		});
	}
}

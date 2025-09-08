export type Channel<levels extends readonly string[] = readonly never[], message = unknown> = {
	[level in levels[number]]: (message: message) => void;
};

export type ChannelDeclaration = readonly [levels: readonly string[], message: unknown];

export interface LoggerDeclaration {
	[channelId: string]: ChannelDeclaration;
}

export type Logger<declaration extends LoggerDeclaration> = {
	[channelId in keyof declaration]: Channel<declaration[channelId][0], declaration[channelId][1]>;
};

export namespace Channel {
	export class Definition<levels extends readonly string[] = readonly never[], message = unknown, intermediate = message> {
		public constructor(
			private levels: levels,
			private level: levels[number],
			private preprocess: (message: message, level: levels[number]) => intermediate,
			private f: (message: intermediate, level: levels[number]) => void,
		) {}
		public log(level: levels[number], message: message): void {
			if (this.levels.findIndex(l => l === level) >= this.levels.findIndex(l => l === this.level))
				this.f(this.preprocess(message, level), level);
		}
	}
	export function create<levels extends readonly string[] = readonly never[], message = unknown, intermediate = message>(
		levels: levels,
		level: levels[number],
		preprocess: (message: message, level: levels[number]) => intermediate,
		f: (message: intermediate, level: levels[number]) => void,
	) {
		const definition = new Definition<levels, message, intermediate>(levels, level, preprocess, f);
		return new Proxy({} as Channel<levels, message>, {
			get(target, prop) {
				if (levels.includes(prop as levels[number])) return (message: message) => definition.log(prop as levels[number], message);
				throw new Error();
			},
		});
	}
}

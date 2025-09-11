export type Channel<levels extends Readonly<Record<string, unknown>>, message = unknown> = {
	[key in keyof levels]: (message: message) => void;
};

export namespace Channel {
	export function create<levels extends Readonly<Record<string, unknown>>, message>(
		levels: levels,
		f: (message: message, level: levels[keyof levels]) => void,
	) {
		return new Proxy({} as Channel<typeof levels, message>, {
			get(target, prop) {
				if (typeof prop === 'string' && Object.keys(levels).includes(prop))
					return (message: message) => f(message, levels[prop as keyof levels]);
				throw new Error();
			},
		});
	}
}

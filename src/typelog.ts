export type Channel<levelName extends string, message = unknown> = {
	[key in levelName]: (message: message) => void;
};

export namespace Channel {
	export function create<levelName extends string, message = unknown>(
		levels: Record<levelName, number>,
		f: (message: message, level: number) => void,
	) {
		return new Proxy({} as Channel<levelName, message>, {
			get(target, prop) {
				if (typeof prop === 'string' && Object.keys(levels).includes(prop))
					return (message: message) => f(message, levels[prop as levelName]);
				throw new Error();
			},
		});
	}
}

import { type LevelEnum } from './level.ts';


export type Channel<levelEnum extends LevelEnum.Prototype, message> = {
    [level in LevelEnum.Name<levelEnum>]: (message: message) => void;
};

export namespace Channel {
    export function create<levelEnum extends LevelEnum.Prototype, message>(
        levelEnum: levelEnum,
        f: (message: message, level: levelEnum[keyof levelEnum]) => void,
    ) {
        return new Proxy({} as Channel<levelEnum, message>, {
            get(target, prop) {
                if (typeof prop === 'string' && Object.keys(levelEnum).includes(prop))
                    return (message: message) => f(message, levelEnum[prop as LevelEnum.Name<levelEnum>]);
                else throw new Error();
            },
        });
    }
}

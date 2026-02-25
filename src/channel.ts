import { type LevelEnum, type LogEventTarget, type ChannelMap, LogEvent } from './log-events.ts';


export type Channel<levelEnum extends LevelEnum.Prototype, message = unknown> = {
    [level in LevelEnum.Name<levelEnum>]: (message: message) => void;
};

export namespace Channel {
    export function create<levelEnum extends LevelEnum.Prototype, message>(
        levelEnum: levelEnum,
        f: (message: message, level: levelEnum[keyof levelEnum]) => void,
        signal?: AbortSignal,
    ) {
        return new Proxy({} as Channel<levelEnum, message>, {
            get(target, prop) {
                if (typeof prop === 'string' && Object.keys(levelEnum).includes(prop))
                    return (message: message) => signal?.aborted
                        ? void undefined
                        : f(message, levelEnum[prop as LevelEnum.Name<levelEnum>]);
                else throw new Error();
            },
        });
    }

    export function transport<message>(
        f: (message: message) => void,
        signal?: AbortSignal,
    ) {
        return (message: message) => signal?.aborted ? void undefined : f(message);
    }

    export function attach<
        channelMap extends ChannelMap.Prototype,
        eventType extends ChannelMap.Names<channelMap>,
    >(
        eventTarget: LogEventTarget<channelMap>,
        eventType: eventType,
        levelEnum: ChannelMap.LevelEnum<channelMap, eventType>,
        signal?: AbortSignal,
    ) {
        type levelEnum = ChannelMap.LevelEnum<channelMap, eventType>;
        type message = ChannelMap.Message<channelMap, eventType>;
        return new Proxy({} as Channel<levelEnum, message>, {
            get(target, prop) {
                if (typeof prop === 'string' && Object.keys(levelEnum).includes(prop))
                    return (message: message) => signal?.aborted
                        ? true
                        : eventTarget.dispatchEvent(
                            new LogEvent(eventType, levelEnum[prop as LevelEnum.Name<levelEnum>], message),
                        );
                else throw new Error();
            },
        });
    }
}

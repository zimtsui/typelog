import { type EventTarget, type Event } from './typed-events.ts';


export namespace LevelEnum {
    export type Prototype = Record<string, unknown>;
    export type Level<levelEnum extends LevelEnum.Prototype> = levelEnum[keyof levelEnum];
    export type Name<levelEnum extends LevelEnum.Prototype> = Extract<keyof levelEnum, string>;
}

export class LogEvent<
    out eventTypes extends string,
    in out levelEnum extends LevelEnum.Prototype,
    out message,
> extends globalThis.CustomEvent<message> implements Event<eventTypes> {
    public override readonly type: eventTypes;
    public readonly level: LevelEnum.Level<levelEnum>;
    public constructor(eventType: eventTypes, level: LevelEnum.Level<levelEnum>, message: message) {
        super(eventType, { detail: message });
        this.type = eventType;
        this.level = level;
    }
}

export namespace ChannelMap {
    export type Prototype = Record<string, [LevelEnum.Prototype, unknown]>;
    export type Names<channelMap extends ChannelMap.Prototype> = Extract<keyof channelMap, string>;
    export type LevelEnum<channelMap extends ChannelMap.Prototype, eventType extends Names<channelMap>> = channelMap[eventType][0];
    export type Message<channelMap extends ChannelMap.Prototype, eventType extends Names<channelMap>> = channelMap[eventType][1];
    export type EventMap<in out channelMap extends ChannelMap.Prototype> = {
        [eventType in Names<channelMap>]: (
            evt: LogEvent<eventType, LevelEnum<channelMap, eventType>, Message<channelMap, eventType>>,
        ) => LogEvent<eventType, LevelEnum<channelMap, eventType>, Message<channelMap, eventType>>;
    };
}

export type LogEventTarget<channelMap extends ChannelMap.Prototype>
    = EventTarget<ChannelMap.Names<channelMap>, ChannelMap.EventMap<channelMap>>;

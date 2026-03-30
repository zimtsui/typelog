import type { EventTarget, CustomEvent } from '@zimtsui/typevent';


export namespace LevelEnum {
    export type Prototype = Record<string, unknown>;
    export type Level<levelEnum extends LevelEnum.Prototype> = levelEnum[keyof levelEnum];
    export type Name<levelEnum extends LevelEnum.Prototype> = Extract<keyof levelEnum, string>;
}

export class LogEvent<
    out eventTypeUnion extends string,
    in out levelEnum extends LevelEnum.Prototype,
    out payload,
> extends globalThis.CustomEvent<payload> implements CustomEvent<eventTypeUnion, payload> {
    public level: LevelEnum.Level<levelEnum>;
    public override type: eventTypeUnion;
    public constructor(eventType: eventTypeUnion, level: LevelEnum.Level<levelEnum>, payload: payload) {
        super(eventType, { detail: payload });
        this.type = eventType;
        this.level = level;
    }
}

export namespace ChannelMap {
    export type Prototype = Record<string, [LevelEnum.Prototype, unknown]>;
    export type Names<channelMap extends ChannelMap.Prototype> = Extract<keyof channelMap, string>;
    export type LevelEnum<channelMap extends ChannelMap.Prototype, eventType extends Names<channelMap>> = channelMap[eventType][0];
    export type Payload<channelMap extends ChannelMap.Prototype, eventType extends Names<channelMap>> = channelMap[eventType][1];
    export type EventMap<in out channelMap extends ChannelMap.Prototype> = {
        [eventType in Names<channelMap>]: LogEvent<eventType, LevelEnum<channelMap, eventType>, Payload<channelMap, eventType>>;
    };
}


export type LogEventTarget<
    channelMap extends ChannelMap.Prototype,
> = EventTarget<ChannelMap.Names<channelMap>, ChannelMap.EventMap<channelMap>>;

export namespace LogEventTarget {
    export type Subscribe<
        channelMap extends ChannelMap.Prototype,
    > = EventTarget.Subscribe<ChannelMap.Names<channelMap>, ChannelMap.EventMap<channelMap>>;
    export type Publish<
        channelMap extends ChannelMap.Prototype,
    > = EventTarget.Publish<ChannelMap.Names<channelMap>, ChannelMap.EventMap<channelMap>>;
}

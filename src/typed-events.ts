export interface Event<out eventTypes extends string> extends globalThis.Event {
    readonly type: eventTypes;
}
export interface EventListener<in events extends globalThis.Event> {
    (evt: events): void;
}

export namespace EventMap {
    export type Prototype<in out eventTypes extends string> = {
        [eventType in eventTypes]: (evt: never) => Event<eventType>;
    }
}

export interface EventTarget<eventTypes extends string, eventMap extends EventMap.Prototype<eventTypes>>
    extends EventTarget.Pub<eventTypes, eventMap>, EventTarget.Sub<eventTypes, eventMap>
{
    addEventListener<eventType extends eventTypes>(
        eventType: eventType,
        listener: EventListener<ReturnType<eventMap[eventType]>> | EventListenerObject | null,
        options?: AddEventListenerOptions | boolean,
    ): void;
    dispatchEvent<eventType extends eventTypes>(event: Parameters<eventMap[eventType]>[0]): boolean;
    removeEventListener<eventType extends eventTypes>(
        eventType: eventType,
        listener: EventListener<ReturnType<eventMap[eventType]>> | EventListenerObject | null,
        options?: EventListenerOptions | boolean,
    ): void;
}

export namespace EventTarget {
    export interface Pub<
        in eventTypes extends string,
        out eventMap extends EventMap.Prototype<eventTypes>,
    > extends globalThis.EventTarget {
        dispatchEvent<eventType extends eventTypes>(event: Parameters<eventMap[eventType]>[0]): boolean;
    }

    export interface Sub<
        in eventTypes extends string,
        out eventMap extends EventMap.Prototype<eventTypes>,
    > extends globalThis.EventTarget {
        addEventListener<eventType extends eventTypes>(
            eventType: eventType,
            listener: EventListener<ReturnType<eventMap[eventType]>> | EventListenerObject | null,
            options?: AddEventListenerOptions | boolean,
        ): void;
        removeEventListener<eventType extends eventTypes>(
            eventType: eventType,
            listener: EventListener<ReturnType<eventMap[eventType]>> | EventListenerObject | null,
            options?: EventListenerOptions | boolean,
        ): void;
    }
}

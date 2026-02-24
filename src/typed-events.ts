export interface Event<out eventTypes extends string> extends globalThis.Event {
    readonly type: eventTypes;
}

export interface EventListener<in events extends globalThis.Event> {
    (event: events): void;
}

export namespace EventMap {
    export type Prototype<in out eventTypes extends string> = {
        [eventType in eventTypes]: (event: never) => Event<eventType>;
    }
}

export interface EventTarget<
    in eventTypes extends string,
    out eventMap extends EventMap.Prototype<eventTypes>,
> extends globalThis.EventTarget {
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

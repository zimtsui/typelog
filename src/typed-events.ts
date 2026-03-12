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
    in out eventTypes extends string,
    in out eventMap extends EventMap.Prototype<eventTypes>,
> extends
    EventTarget.Subscribe<eventTypes, eventMap>,
    EventTarget.Publish<eventTypes, eventMap>
{
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
    dispatchEvent<eventType extends eventTypes>(event: Parameters<eventMap[eventType]>[0]): boolean;
}

export namespace EventTarget {

    //  对于订阅端来说，事件多的是子类型
    export interface Subscribe<
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

    //  对于发布端来说，事件少的是子类型
    export interface Publish<
        out eventTypes extends string,
        in eventMap extends EventMap.Prototype<eventTypes>,
    > extends globalThis.EventTarget {
        dispatchEvent<eventType extends eventTypes>(event: Parameters<eventMap[eventType]>[0]): boolean;
    }
}

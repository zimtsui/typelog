import * as Presets from './presets.ts';


export interface Message {
    scope: string;
    channel: string;
    payload: unknown;
    level: Presets.Level;
}

export interface Exporter {
    monolith(message: Message): void;
    stream(message: Message): void;
}
export namespace Exporter {
    class Default implements Exporter {
        public monolith() {}
        public stream() {}
    }
    export const defau1t: Exporter = new Default();
}

export let exporter: Exporter = Exporter.defau1t;

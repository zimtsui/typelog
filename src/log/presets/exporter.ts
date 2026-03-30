import * as Presets from './level.ts';


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
    let exporter: Exporter = new Default();

    export function setGlobalExporter(newExporter: Exporter) {
        exporter = newExporter;
    }

    export function getGlobalExporter(): Exporter {
        return exporter;
    }
}

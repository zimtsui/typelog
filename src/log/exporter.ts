

export interface Message {
    scope: string;
    channel: string;
    payload: unknown;
    level: string;
}

export interface Exporter {
    monolith(message: Message): void;
    stream(message: Message): void;
}

export namespace Exporter {
    export class Noop implements Exporter {
        public monolith() {}
        public stream() {}
    }
    let globalExporter: Exporter = new Noop();

    export function setGlobalExporter(exporter: Exporter) {
        globalExporter = exporter;
    }

    export function getGlobalExporter(): Exporter {
        return globalExporter;
    }
}

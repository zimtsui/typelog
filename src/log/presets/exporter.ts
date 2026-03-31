import { Exporter as GenericExporter } from '../exporter.ts';
import { Level } from './level.ts';


export namespace Exporter {
    export class Noop implements GenericExporter<typeof Level> {
        public monolith() {}
        public stream() {}
    }
    let globalExporter: GenericExporter<typeof Level> = new Noop();

    export function setGlobalExporter(exporter: GenericExporter<typeof Level>): void {
        globalExporter = exporter;
    }

    export function getGlobalExporter(): GenericExporter<typeof Level> {
        return globalExporter;
    }
}

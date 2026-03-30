import { Frame, Stack } from "./stack.ts";


export class Injection {
    public constructor(protected stack: Stack) {}
    protected map = new WeakMap<Error, Frame[]>();

    public prepend(e: Error): void {
        const frame = this.stack.getFrame();
        if (frame) {} else throw new Error();
        const frames = this.map.get(e) ?? [];
        this.map.set(e, [frame, ...frames]);
    }

    public read(e: Error): Frame[] {
        return this.map.get(e) ?? [];
    }
}

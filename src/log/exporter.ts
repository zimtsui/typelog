import { LevelEnum } from './level.ts';


export interface Message<levelEnum extends LevelEnum.Prototype> {
    scope: string;
    channel: string;
    payload: unknown;
    level: LevelEnum.Level<levelEnum>;
}

export interface Exporter<levelEnum extends LevelEnum.Prototype> {
    monolith(message: Message<levelEnum>): void;
    stream(message: Message<levelEnum>): void;
}

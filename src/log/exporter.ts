import { LevelEnum } from './level.ts';


export interface Message<levelEnum extends LevelEnum.Prototype> {
    scope: string;
    channel: string;
    payload: unknown;
    level: LevelEnum.Level<levelEnum>;
}

export interface Exporter<levelEnum extends LevelEnum.Prototype> {
    (message: Message<levelEnum>): void;
}

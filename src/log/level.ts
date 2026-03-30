export namespace LevelEnum {
    export type Prototype = Record<string, unknown>;
    export type Level<levelEnum extends LevelEnum.Prototype> = levelEnum[keyof levelEnum];
    export type Name<levelEnum extends LevelEnum.Prototype> = Extract<keyof levelEnum, string>;
}

export namespace LevelMap {
    export type Proto = Record<string, number>;
    export type Number<levelMap extends LevelMap.Proto> = levelMap[keyof levelMap];
    export type Text<levelMap extends LevelMap.Proto> = Extract<keyof levelMap, string>;
}

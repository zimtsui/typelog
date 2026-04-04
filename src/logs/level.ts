export namespace LevelMap {
    export type Prototype = Record<string, number>;
    export type Number<levelMap extends LevelMap.Prototype> = levelMap[keyof levelMap];
    export type Text<levelMap extends LevelMap.Prototype> = Extract<keyof levelMap, string>;
}

export interface PlaygroundData { name: string; size: { width: number; height: number }; sceneB64: string; layoutB64: string }
export function playgroundData(path: string, name?: string): Promise<PlaygroundData>;
export function writePlaygroundData(path: string, outFile: string, name?: string): Promise<PlaygroundData>;

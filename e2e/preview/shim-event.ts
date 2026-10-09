export type UnlistenFn = () => void;
export async function listen(): Promise<UnlistenFn> { return () => {}; }

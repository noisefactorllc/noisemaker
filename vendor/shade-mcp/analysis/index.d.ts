declare function checkAlgEquiv(effectId: string): Promise<any>;

declare function analyzeBranching(effectId: string, backend: string): Promise<any>;

export { analyzeBranching, checkAlgEquiv };

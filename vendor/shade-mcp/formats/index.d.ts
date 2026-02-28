import { E as EffectDefinition } from '../types-BZ1yH2Of.js';
export { a as EffectPass, b as EffectUniform } from '../types-BZ1yH2Of.js';

declare function parseDefinitionJson(json: Record<string, unknown>, effectDir: string): EffectDefinition;

declare function parseDefinitionJs(filePath: string, effectDir: string): EffectDefinition;

declare function loadEffectDefinition(effectDir: string): EffectDefinition;

export { EffectDefinition, loadEffectDefinition, parseDefinitionJs, parseDefinitionJson };

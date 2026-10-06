export interface EffectUniform {
    name: string;
    type: 'float' | 'int' | 'vec2' | 'vec3' | 'vec4' | 'boolean' | (string & {});
    uniform: string;
    default?: unknown;
    min?: number;
    max?: number;
    step?: number;
    choices?: Record<string, unknown>;
    control?: boolean;
    /** Compile-time define name for a global that is not a runtime uniform. */
    define?: string;
    ui?: Record<string, unknown>;
}
export interface EffectPass {
    name?: string;
    program: string;
    type?: 'render' | 'compute' | 'gpgpu';
    inputs?: Record<string, string>;
    outputs?: Record<string, string>;
}
export interface EffectDefinition {
    func: string;
    name?: string;
    namespace?: string;
    description?: string;
    starter?: boolean;
    tags?: string[];
    globals: Record<string, EffectUniform>;
    passes: EffectPass[];
    format: 'json' | 'js';
    effectDir: string;
    /**
     * Set when a `definition.js` value could not be read without running the
     * module (for example passes built with a spread or `Array.from`). The
     * definition is then incomplete, and `partialReasons` says where.
     */
    partial?: boolean;
    partialReasons?: string[];
}
//# sourceMappingURL=types.d.ts.map
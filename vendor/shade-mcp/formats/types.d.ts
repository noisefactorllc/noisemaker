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
    /** The name of a std enum table. */
    enum?: string;
    zero?: unknown;
    randMin?: unknown;
    randMax?: unknown;
    randChance?: unknown;
    randChoices?: number[];
    colorModeUniform?: string;
    inheritsSeed?: boolean;
}
export interface EffectPass {
    name?: string;
    program: string;
    type?: 'render' | 'compute' | 'gpgpu';
    inputs?: Record<string, string>;
    outputs?: Record<string, string>;
    entryPoint?: string;
    drawMode?: 'points' | 'triangles' | 'billboards' | (string & {});
    drawBuffers?: number;
    count?: number | string;
    countUniform?: string;
    repeat?: number | string;
    blend?: boolean | string[];
    workgroups?: Array<number | string>;
    storageTextures?: Record<string, string>;
    viewport?: Record<string, unknown>;
    conditions?: {
        runIf?: Array<{
            uniform: string;
            equals: unknown;
        }>;
        skipIf?: Array<{
            uniform: string;
            equals: unknown;
        }>;
    };
    defines?: Record<string, string | number>;
    uniforms?: Record<string, number | string>;
    clear?: boolean;
    samplerTypes?: Record<string, string>;
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
    feature?: string;
    hidden?: boolean;
    deprecatedBy?: string;
    openCategories?: string[];
    textures?: Record<string, Record<string, unknown>>;
    textures3d?: Record<string, Record<string, unknown>>;
    /** A map of uniform names to slots, a list of entries, or a byte layout. */
    uniformLayout?: Record<string, unknown> | unknown[];
    /** A uniform layout for each program, in any form that uniformLayout takes. */
    uniformLayouts?: Record<string, Record<string, unknown> | unknown[]>;
    defaultProgram?: string;
    externalTexture?: string;
    externalMesh?: string;
    builtinMeshes?: Record<string, string>;
    outputTex3d?: string;
    outputGeo?: string;
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
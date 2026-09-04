import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
export interface WebGL2RenderPart {
    name: string;
    color: [number, number, number];
    indexStart: number;
    indexCount: number;
}
/**
 * Browser fallback renderer. It draws the same canonical human parts as the
 * WebGPU path, but consumes CPU-computed morph/skinning buffers and renders
 * them with WebGL2 vertex/index buffers.
 */
export declare class WebGL2HumanRenderer {
    private readonly canonical;
    private readonly gl;
    private readonly program;
    private readonly posBuffer;
    private readonly normalBuffer;
    private readonly uvBuffer;
    private readonly indexBuffer;
    private readonly parts;
    private readonly mvpLoc;
    private readonly normalLoc;
    private readonly colorLoc;
    constructor(canvas: HTMLCanvasElement, canonical: CanonicalHuman);
    render(positions: Float32Array, normals?: Float32Array): void;
}
export declare function buildWebGL2RenderParts(canonical: CanonicalHuman): WebGL2RenderPart[];
export declare function webglPartColor(name: string, kind: string): [number, number, number];
//# sourceMappingURL=renderer.d.ts.map
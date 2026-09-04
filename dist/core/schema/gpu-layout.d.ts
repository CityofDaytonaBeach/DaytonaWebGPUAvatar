import { PropertyRegistry } from './registry.js';
export interface WgslLayoutField {
    path: string;
    name: string;
    type: 'f32' | 'u32' | 'i32';
    byteOffset: number;
    byteSize: number;
}
export interface WgslLayoutValidationIssue {
    path: string;
    message: string;
}
export interface WgslLayoutValidationResult {
    valid: boolean;
    byteSize: number;
    fields: WgslLayoutField[];
    issues: WgslLayoutValidationIssue[];
}
export declare function wgslFieldName(path: string): string;
export declare function generateHumanParamsWgsl(registry: PropertyRegistry, structName?: string): string;
export declare function validateWgslLayout(registry: PropertyRegistry): WgslLayoutValidationResult;
export declare function wgslLayoutFields(registry: PropertyRegistry): WgslLayoutField[];
//# sourceMappingURL=gpu-layout.d.ts.map
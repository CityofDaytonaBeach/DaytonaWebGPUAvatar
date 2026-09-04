import { PropertyRegistry } from './registry.js';
export interface JsonSchemaProperty {
    type: 'number' | 'integer' | 'boolean';
    minimum?: number;
    maximum?: number;
    default: number | boolean;
    description: string;
    metadata: {
        id: number;
        units?: string;
        category: number;
        persistence: string;
        identityImportance: number;
        gpuByteOffset?: number;
        lodImportance: number;
        animationCapable: boolean;
        automationCapable: boolean;
        dependencies: number[];
    };
}
export interface HumanDefinitionJsonSchema {
    $schema: 'https://json-schema.org/draft/2020-12/schema';
    $id: string;
    title: string;
    type: 'object';
    additionalProperties: false;
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
}
export interface SchemaValidationIssue {
    path: string;
    message: string;
}
export interface SchemaValidationResult {
    valid: boolean;
    issues: SchemaValidationIssue[];
}
export declare function generateHumanDefinitionJsonSchema(registry: PropertyRegistry, id?: string): HumanDefinitionJsonSchema;
export declare function validateHumanDefinitionRecord(registry: PropertyRegistry, record: Record<string, unknown>): SchemaValidationResult;
//# sourceMappingURL=json-schema.d.ts.map
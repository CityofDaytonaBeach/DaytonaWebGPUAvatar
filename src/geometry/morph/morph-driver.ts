import { PropertyRegistry } from '../../core/schema/registry.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';

/**
 * A corrective morph is driven by the continuous product of several shaped
 * coefficients rather than a single property. This is how combination correctives
 * (e.g. wide jaw + wide mouth) flow through the existing sparse morph pipeline.
 */
export interface MorphCorrectiveWeight {
  kind: 'corrective';
  /** One entry per contributing property; the activation is their product. */
  inputs: Array<{ property: string; influence?: (c: number) => number }>;
}

export type MorphWeightSource = string | MorphCorrectiveWeight;

/** Identity-shaped coefficient from a property value (mirrors ShapeCoefficientSolver). */
function coefficientFor(value: number, min: number, max: number, def: number): number {
  if (def !== 0) return value / def - 1;
  const span = max - min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (value - min) / span));
}

/**
 * Maps semantic property values into morph weights that drive the GPU/CPU
 * morph pipeline.
 *
 * One property (e.g. face.eyeSpacing) may drive several morphs spread across
 * multiple parts/regions (body eye boxes, sclera, iris), so a property maps to
 * a list of morph names all sharing the same weight. Corrective morphs are
 * weighted by the continuous product of multiple shaped coefficients.
 *
 * Weight model (matches ShapeCoefficientSolver for consistency):
 *   - default != 0 : (value / default) - 1  (a ratio about neutral)
 *   - default == 0 : value scaled into the property's (min,max) as 0..1
 */
export class MorphDriver {
  /** morphName -> weight source (a property path, or a corrective combination). */
  private morphToProperty = new Map<string, string | MorphCorrectiveWeight>();
  private properties = new Set<string>();

  constructor(private registry: PropertyRegistry) {
    this.register('face.nose.width', 'noseWidth');
    this.register('face.jaw.width', 'jawWidth');
    this.register('face.eyeSpacing', 'eyeSpacing', 'eyeSpacingSclera', 'eyeSpacingIris');
    this.register('body.muscularity', 'muscularity');
    this.register('face.mouth.width', 'mouthWidth');
    this.register('expression.jawOpen', 'jawOpen', 'jawOpenCavity');
    // Parametric anatomy corrective morphs.
    this.register(
      'global.height',
      'heightTorso',
      'heightNeck',
      'heightHead',
      'heightUpperarmL',
      'heightUpperarmR',
      'heightForearmL',
      'heightForearmR',
      'heightThighL',
      'heightThighR',
      'heightShinL',
      'heightShinR',
    );
    this.register('skeleton.shoulderWidth', 'shoulderWidth');
    this.register('body.waist', 'waist');
    this.register('body.bodyFat', 'bodyFat');
    this.register('skeleton.spineLength', 'spine');
    this.register('skeleton.neckLength', 'neckScale');
  }

  private register(propPath: string, ...morphNames: string[]): void {
    void this.registry.require(propPath);
    this.properties.add(propPath);
    for (const n of morphNames) this.morphToProperty.set(n, propPath);
  }

  /**
   * Public registration of a single-property (linear) morph — used to wire shape
   * bases compiled into sparse morphs back to their driving property.
   */
  registerBasis(name: string, propPath: string): void {
    this.register(propPath, name);
  }

  /**
   * Register a corrective morph driven by the continuous product of several
   * shaped coefficients. The corrective is exposed as a normal sparse morph so
   * the existing GPU morph pipeline consumes it (weight == product of inputs).
   */
  registerCorrective(
    morphName: string,
    inputs: MorphCorrectiveWeight['inputs'],
  ): void {
    for (const input of inputs) {
      void this.registry.require(input.property);
      this.properties.add(input.property);
    }
    this.morphToProperty.set(morphName, { kind: 'corrective', inputs });
  }

  /** Morph names driven by a property path (linear, single-property morphs). */
  morphsForProperty(propPath: string): string[] {
    const meta = this.registry.require(propPath);
    const id = meta.id;
    const out: string[] = [];
    for (const [m, p] of this.morphToProperty) {
      if (typeof p === 'string' && p === propPath && this.registry.require(p).id === id)
        out.push(m);
    }
    return out;
  }

  /** True if a morph's weight source references the given property path. */
  morphUsesProperty(morphName: string, propPath: string): boolean {
    const source = this.morphToProperty.get(morphName);
    if (typeof source === 'string') return source === propPath;
    if (source && source.kind === 'corrective') {
      return source.inputs.some((i) => i.property === propPath);
    }
    return false;
  }

  /** Weight of a morph based on the current definition. 0 = neutral. */
  weight(definition: HumanDefinition, morphName: string): number {
    const source = this.morphToProperty.get(morphName);
    if (!source) return 0;
    if (typeof source === 'string') {
      const meta = this.registry.require(source);
      return coefficientFor(
        definition.get(source),
        typeof meta.min === 'number' ? meta.min : 0,
        typeof meta.max === 'number' ? meta.max : 1,
        meta.default,
      );
    }
    if (source.kind === 'corrective') {
      let acc = 1;
      for (const input of source.inputs) {
        const meta = this.registry.require(input.property);
        let c = coefficientFor(
          definition.get(input.property),
          typeof meta.min === 'number' ? meta.min : 0,
          typeof meta.max === 'number' ? meta.max : 1,
          meta.default,
        );
        if (input.influence) c = input.influence(c);
        acc *= c;
        if (acc === 0) break;
      }
      return acc;
    }
    return 0;
  }
}

import { PropertyRegistry } from '../../core/schema/registry.js';
import { HumanDefinition } from '../../core/schema/human-definition.js';

/**
 * Maps semantic property values into morph weights that drive the GPU/CPU
 * morph pipeline.
 *
 * One property (e.g. face.eyeSpacing) may drive several morphs spread across
 * multiple parts/regions (body eye boxes, sclera, iris), so a property maps to
 * a list of morph names all sharing the same weight.
 *
 * Weight model:
 *   - default != 0 : (value / default) - 1  (a ratio about neutral)
 *   - default == 0 : value scaled into the property's (min,max) as 0..1
 */
export class MorphDriver {
  /** morphName -> property path that drives it. */
  private morphToProperty = new Map<string, string>();

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
    for (const n of morphNames) this.morphToProperty.set(n, propPath);
  }

  /** Morph names driven by a property path. */
  morphsForProperty(propPath: string): string[] {
    const meta = this.registry.require(propPath);
    const id = meta.id;
    const out: string[] = [];
    for (const [m, p] of this.morphToProperty) {
      if (p === propPath && this.registry.require(p).id === id) out.push(m);
    }
    return out;
  }

  /** Weight of a morph based on the current definition. 0 = neutral. */
  weight(definition: HumanDefinition, morphName: string): number {
    const propPath = this.morphToProperty.get(morphName);
    if (!propPath) return 0;
    const meta = this.registry.require(propPath);
    const value = definition.get(propPath);
    if (meta.default !== 0) {
      return value / meta.default - 1;
    }
    // Range-based weight for 0-default (typically 0..1) properties.
    const lo = typeof meta.min === 'number' ? meta.min : 0;
    const hi = typeof meta.max === 'number' ? meta.max : 1;
    const span = hi - lo;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (value - lo) / span));
  }
}

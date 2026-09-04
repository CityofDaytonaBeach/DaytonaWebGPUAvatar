/**
 * Chrome/Dawn rejects a shader module outright when any identifier collides
 * with a WGSL *reserved* word (not just a keyword) — e.g. `let meta = ...`
 * fails with "'meta' is a reserved keyword". That failure surfaces only as a
 * device validation error at pipeline creation, so a broken shader can render
 * nothing while the frame loop happily reports 60fps. This test guards every
 * shipped WGSL source against that class of failure at build time.
 */

import { describe, it, expect } from 'vitest';
import { MORPH_COMPUTE_WGSL } from './morph-wgsl.js';
import { PHOTOREAL_HUMAN_WGSL } from './photoreal-wgsl.js';
import * as shaders from './shaders.js';
import * as skin from './skin-wgsl.js';

/** WGSL reserved words (spec §2.3, "Reserved Words"), abridged to the ones a
 * TypeScript author is realistically going to reach for as a local name. */
const RESERVED = [
  'meta',
  'enum',
  'typedef',
  'handle',
  'shared',
  'union',
  'common',
  'filter',
  'do',
  'match',
  'class',
  'new',
  'delete',
  'get',
  'set',
  'active',
  'auto',
  'become',
  'binding_array',
  'cast',
  'catch',
  'coherent',
  'compile',
  'crate',
  'demote',
  'explicit',
  'export',
  'extends',
  'external',
  'final',
  'friend',
  'from',
  'generic',
  'goto',
  'groupshared',
  'inline',
  'input',
  'instanceof',
  'interface',
  'layout',
  'lowp',
  'macro',
  'mediump',
  'module',
  'namespace',
  'null',
  'nullptr',
  'operator',
  'output',
  'package',
  'passthrough',
  'patch',
  'pixel',
  'precise',
  'precision',
  'premerge',
  'priv',
  'protected',
  'pub',
  'public',
  'readonly',
  'ref',
  'regardless',
  'register',
  'reinterpret_cast',
  'require',
  'resource',
  'restrict',
  'self',
  'signed',
  'sizeof',
  'smooth',
  'snorm',
  'static',
  'subroutine',
  'super',
  'target',
  'template',
  'this',
  'thread',
  'throw',
  'trait',
  'try',
  'type',
  'unless',
  'unorm',
  'unsafe',
  'unsized',
  'use',
  'using',
  'virtual',
  'volatile',
  'wgsl',
  'where',
  'with',
  'writeonly',
  'yield',
] as const;

function wgslSources(): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['MORPH_COMPUTE_WGSL', MORPH_COMPUTE_WGSL],
    ['PHOTOREAL_HUMAN_WGSL', PHOTOREAL_HUMAN_WGSL],
  ];
  for (const mod of [shaders, skin] as Array<Record<string, unknown>>) {
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'string' && /@(compute|vertex|fragment)/.test(value)) {
        out.push([name, value]);
      }
    }
  }
  return out;
}

/** Declared names in a WGSL source: let/var/const/fn/struct/parameters. */
function declaredNames(source: string): string[] {
  const names: string[] = [];
  const decl =
    /\b(?:let|var|const|fn|struct|alias)\b(?:<[^>]*>)?\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  for (const m of source.matchAll(decl)) names.push(m[1]!);
  // Function parameters and struct members: `name : type`.
  for (const m of source.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z_]/g)) {
    names.push(m[1]!);
  }
  return names;
}

describe('shipped WGSL avoids reserved words', () => {
  const sources = wgslSources();

  it('finds every shipped shader source', () => {
    expect(sources.length).toBeGreaterThanOrEqual(3);
  });

  for (const [name, source] of sources) {
    it(`${name} declares no reserved identifier`, () => {
      const reserved = new Set<string>(RESERVED);
      const offenders = [...new Set(declaredNames(source))].filter((id) => reserved.has(id));
      expect(offenders, `${name} uses WGSL reserved word(s): ${offenders.join(', ')}`).toEqual([]);
    });
  }
});

import { CanonicalHuman } from '../../geometry/canonical/canonical-human.js';
import { buildCameraMatrices } from '../webgpu/renderer.js';

export interface WebGL2RenderPart {
  name: string;
  color: [number, number, number];
  indexStart: number;
  indexCount: number;
}

const VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec2 uv;
uniform mat4 mvp;
uniform mat3 normalMat;
out vec3 vNormal;
out vec2 vUv;
void main() {
  gl_Position = mvp * vec4(position, 1.0);
  vNormal = normalize(normalMat * normal);
  vUv = uv;
}
`;

const FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUv;
uniform vec4 baseColor;
out vec4 outColor;
void main() {
  vec3 lightDir = normalize(vec3(0.35, -0.7, 0.5));
  float ndl = max(dot(normalize(vNormal), lightDir), 0.0);
  vec3 shade = baseColor.rgb * (0.34 + 0.66 * ndl);
  outColor = vec4(shade, baseColor.a);
}
`;

/**
 * Browser fallback renderer. It draws the same canonical human parts as the
 * WebGPU path, but consumes CPU-computed morph/skinning buffers and renders
 * them with WebGL2 vertex/index buffers.
 */
export class WebGL2HumanRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly posBuffer: WebGLBuffer;
  private readonly normalBuffer: WebGLBuffer;
  private readonly uvBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private readonly parts: WebGL2RenderPart[];
  private readonly mvpLoc: WebGLUniformLocation;
  private readonly normalLoc: WebGLUniformLocation;
  private readonly colorLoc: WebGLUniformLocation;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly canonical: CanonicalHuman,
  ) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.program = createProgram(gl, VS, FS);
    this.posBuffer = requireBuffer(gl.createBuffer());
    this.normalBuffer = requireBuffer(gl.createBuffer());
    this.uvBuffer = requireBuffer(gl.createBuffer());
    this.indexBuffer = requireBuffer(gl.createBuffer());
    this.parts = buildWebGL2RenderParts(canonical);

    const mvpLoc = gl.getUniformLocation(this.program, 'mvp');
    const normalLoc = gl.getUniformLocation(this.program, 'normalMat');
    const colorLoc = gl.getUniformLocation(this.program, 'baseColor');
    if (!mvpLoc || !normalLoc || !colorLoc) throw new Error('WebGL2 shader uniform missing');
    this.mvpLoc = mvpLoc;
    this.normalLoc = normalLoc;
    this.colorLoc = colorLoc;

    const { normals } = canonical.baseGeometry();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, extractUvs(canonical), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, canonical.indices, gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  render(positions: Float32Array, normals?: Float32Array): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.07, 0.09, 0.12, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const camera = buildCameraMatrices(canvas.width, canvas.height);
    gl.uniformMatrix4fv(this.mvpLoc, false, camera.mvp);
    gl.uniformMatrix3fv(this.normalLoc, false, camera.normalMat);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    if (normals) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    for (const part of this.parts) {
      gl.uniform4f(this.colorLoc, part.color[0], part.color[1], part.color[2], 1);
      gl.drawElements(gl.TRIANGLES, part.indexCount, gl.UNSIGNED_INT, part.indexStart * 4);
    }
  }
}

export function buildWebGL2RenderParts(canonical: CanonicalHuman): WebGL2RenderPart[] {
  const bodyEnd =
    canonical.parts.length > 0 ? canonical.parts[0].indexStart : canonical.indices.length;
  const parts: WebGL2RenderPart[] = [
    { name: 'body', color: [0.72, 0.56, 0.45], indexStart: 0, indexCount: bodyEnd },
  ];
  for (const p of canonical.parts) {
    parts.push({
      name: p.name,
      color: webglPartColor(p.name, p.kind),
      indexStart: p.indexStart,
      indexCount: p.indexCount,
    });
  }
  return parts;
}

export function webglPartColor(name: string, kind: string): [number, number, number] {
  if (kind === 'sclera') return [0.95, 0.95, 0.95];
  if (kind === 'limbus') return [0.3, 0.34, 0.32];
  if (kind === 'cornea') return [0.55, 0.6, 0.62];
  if (kind === 'iris') return name.startsWith('pupil') ? [0.12, 0.1, 0.12] : [0.35, 0.52, 0.38];
  if (kind === 'teeth') return [0.93, 0.91, 0.84];
  if (kind === 'tongue') return [0.82, 0.5, 0.48];
  if (kind === 'mouth_cavity') return [0.22, 0.1, 0.11];
  return [0.72, 0.56, 0.45];
}

function extractUvs(canonical: CanonicalHuman): Float32Array {
  const out = new Float32Array(canonical.vertexCount * 2);
  for (let i = 0; i < canonical.vertices.length; i++) {
    out[i * 2] = canonical.vertices[i].uv.u;
    out[i * 2 + 1] = canonical.vertices[i].uv.v;
  }
  return out;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = requireProgram(gl.createProgram());
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      `WebGL2 program link failed: ${gl.getProgramInfoLog(program) ?? 'unknown error'}`,
    );
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = requireShader(gl.createShader(type));
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      `WebGL2 shader compile failed: ${gl.getShaderInfoLog(shader) ?? 'unknown error'}`,
    );
  }
  return shader;
}

function requireBuffer(buffer: WebGLBuffer | null): WebGLBuffer {
  if (!buffer) throw new Error('WebGL2 buffer allocation failed');
  return buffer;
}

function requireProgram(program: WebGLProgram | null): WebGLProgram {
  if (!program) throw new Error('WebGL2 program allocation failed');
  return program;
}

function requireShader(shader: WebGLShader | null): WebGLShader {
  if (!shader) throw new Error('WebGL2 shader allocation failed');
  return shader;
}

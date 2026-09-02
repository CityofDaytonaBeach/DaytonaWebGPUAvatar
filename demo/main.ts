import {
  Human,
  KernelWork,
  WebGL2HumanRenderer,
  createDeviceAndProfile,
  quatFromEuler,
} from '../src';
import type { DeviceCapabilities } from '../src';

// Part colors mirror the GPU renderer's per-part materials.
function partColor(name: string, kind: string): string {
  if (kind === 'sclera') return '#eef0f2';
  if (kind === 'iris') return name.startsWith('pupil') ? '#141114' : '#5a854f';
  if (kind === 'teeth') return '#ebe7d8';
  if (kind === 'tongue') return '#d07f75';
  if (kind === 'mouth_cavity') return '#2f1618';
  return '#b98f73'; // skin
}

// ---------------------------------------------------------------------------
// Minimal 2D canvas renderer for the canonical block human. It reads the
// canonical vertices + the Human's accumulated morph deltas (CPU reference
// path) and draws the body plus each detail part (eyes/teeth/tongue/cavity)
// in its own color. Shows that only affected geometry moves on each edit.
// ---------------------------------------------------------------------------
class CanvasHumanRenderer {
  constructor(private canvas: HTMLCanvasElement) {}

  /**
   * @param skinned When animating, an optional array of final skinned positions
   *   (Float32Array) overrides the morph-deformed base so bones visibly move.
   */
  render(human: Human, skinned?: Float32Array) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, w, h);

    const canonical = human.canonicalRef;
    const vertices = canonical.vertices;
    const delta = human.computeMorphDelta();

    const proj = (x: number, y: number): [number, number] => {
      const sx = ((x + 1.3) / 2.6) * w;
      const sy = ((1.9 - y) / 3.3) * h;
      return [sx, sy];
    };

    // Full 3D position of a vertex (skinned when animating, else morph-deformed).
    const pvec = (id: number): [number, number, number] =>
      skinned
        ? [skinned[id * 3], skinned[id * 3 + 1], skinned[id * 3 + 2]]
        : [
            vertices[id].position.x + delta[id * 3],
            vertices[id].position.y + delta[id * 3 + 1],
            vertices[id].position.z + delta[id * 3 + 2],
          ];
    const px = (id: number) => pvec(id)[0];
    const py = (id: number) => pvec(id)[1];

    // Key light direction; flat-shade each face from its computed normal so the
    // skinned-normals rotation is visible when the limb animates.
    const light = normalize3([0.5, 0.6, 0.85]);
    const shade = (baseHex: string, n: [number, number, number]): string => {
      const d = n[0] * light[0] + n[1] * light[1] + n[2] * light[2];
      const a = 0.55 + 0.45 * Math.max(0, d);
      const r = parseInt(baseHex.slice(1, 3), 16);
      const g = parseInt(baseHex.slice(3, 5), 16);
      const b = parseInt(baseHex.slice(5, 7), 16);
      return `rgb(${Math.round(r * a)},${Math.round(g * a)},${Math.round(b * a)})`;
    };
    const cross3 = (u: number[], v: number[]): [number, number, number] => [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    function normalize3(v: number[]): [number, number, number] {
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    }

    const drawRange = (start: number, count: number, color: string) => {
      const idx = canonical.indices;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let i = start; i < start + count; i += 3) {
        if (i + 2 >= start + count) break;
        const a = vertices[idx[i]];
        const b = vertices[idx[i + 1]];
        const c = vertices[idx[i + 2]];
        const pa = pvec(a.id);
        const pb = pvec(b.id);
        const pc = pvec(c.id);
        const n = normalize3(
          cross3(
            [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]],
            [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]],
          ),
        );
        ctx.fillStyle = shade(color, n);
        const [ax, ay] = proj(pa[0], pa[1]);
        const [bx, by] = proj(pb[0], pb[1]);
        const [cx, cy] = proj(pc[0], pc[1]);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
    };

    // Body: all triangles before the first detail part.
    const bodyEnd =
      canonical.parts.length > 0 ? canonical.parts[0].indexStart : canonical.indices.length;
    drawRange(0, bodyEnd, partColor('body', 'skin'));
    // Detail parts in canonical order.
    for (const p of canonical.parts) {
      drawRange(p.indexStart, p.indexCount, partColor(p.name, p.kind));
    }

    // Joint markers from the parametric skeleton (world-space accumulation).
    const bones = human.parametricSkeleton();
    const worldPos = new Map<string, [number, number, number]>();
    for (const b of bones) {
      const parentPos = b.parent ? (worldPos.get(b.parent) ?? [0, 0, 0]) : [0, 0, 0];
      worldPos.set(b.name, [
        parentPos[0] + b.localPosition.x,
        parentPos[1] + b.localPosition.y,
        parentPos[2] + b.localPosition.z,
      ]);
    }
    ctx.fillStyle = 'rgba(255,170,90,1)';
    for (const b of bones) {
      const [jx2, jy2] = [worldPos.get(b.name)![0], worldPos.get(b.name)![1]];
      const [sxp, syp] = proj(jx2, jy2);
      ctx.beginPath();
      ctx.arc(sxp, syp, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Anatomy summary.
    const dims = human.solveAnatomy();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px monospace';
    const parts = canonical.parts.map((p) => p.name).join(', ');
    ctx.fillText(`parts: body · ${parts}`, 10, h - 12);
    ctx.fillText(
      `anatomy: ${dims.height.toFixed(2)}m · hips ${dims.hipHeight.toFixed(2)} · sh ${dims.shoulderHeight.toFixed(2)} · score ${human.anatomyScore().toFixed(2)}`,
      10,
      h - 24,
    );
  }
}

interface ModifyResultLike {
  cancelled: boolean;
  reason?: string;
  affectedKernelWork: KernelWork[];
  dirtyRegions: string[];
}

function bindRange(id: string, label: string, onInput: (v: number) => void) {
  const el = document.getElementById(id) as HTMLInputElement;
  const val = document.getElementById(label) as HTMLElement;
  el.addEventListener('input', () => {
    const num = Number(el.value);
    val.textContent = (num / 100).toFixed(2);
    onInput(num / 100);
  });
}

function formatResult(tag: string, r: ModifyResultLike): string {
  if (r.cancelled) return `[${tag}] CANCELLED: ${r.reason}`;
  const kinds = r.affectedKernelWork.map((k) => k.kind).join(', ');
  return `[${tag}] ok\nkernels: ${kinds || '(expression/timing)'}\ndirty: ${r.dirtyRegions.join(', ') || 'none'}\n→ GPU-resident, minimal compute only`;
}

function morphedPositions(human: Human): Float32Array {
  const { positions } = human.canonicalRef.baseGeometry();
  const delta = human.computeMorphDelta();
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i++) out[i] = positions[i] + delta[i];
  return out;
}

async function main() {
  const canvas = document.getElementById('viewport') as HTMLCanvasElement;
  const log = document.getElementById('log') as HTMLElement;
  const timelineInfo = document.getElementById('timelineInfo') as HTMLElement;
  const badge = document.createElement('span');
  badge.className = 'badge';
  const title = document.querySelector('h1');
  if (title) title.appendChild(document.createTextNode(' ')).after(badge);

  // Try to bring up a WebGPU device. On success the mesh is rendered by the
  // GPU-resident morph + render pipeline; otherwise we fall back to the 2D CPU
  // canvas renderer (reference path).
  let caps: DeviceCapabilities | null = null;
  let ctx: GPUCanvasContext | null = null;
  let gpuLabel = 'WebGPU unavailable';
  try {
    caps = await createDeviceAndProfile();
    ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (ctx && 'configure' in ctx!) {
      ctx.configure({
        device: caps.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'opaque',
      });
      gpuLabel = `WebGPU · ${caps.profile}`;
    } else {
      caps = null;
    }
  } catch (e) {
    caps = null;
  }

  const human = await Human.create({
    device: caps?.device ?? undefined,
    format: navigator.gpu?.getPreferredCanvasFormat?.() ?? undefined,
    seed: {
      'global.height': 1.78,
      'body.waist': 1.0,
      'skeleton.shoulderWidth': 1.0,
      'body.muscularity': 0.48,
    },
  });
  const canvasRenderer = new CanvasHumanRenderer(canvas);

  let webglRenderer: WebGL2HumanRenderer | null = null;
  if (!caps) {
    try {
      webglRenderer = new WebGL2HumanRenderer(canvas, human.canonicalRef);
      gpuLabel = 'WebGL2 fallback · CPU morph/skinning buffers';
    } catch (e) {
      gpuLabel = `WebGPU/WebGL2 unavailable — using CPU canvas renderer (${(e as Error).message})`;
    }
  }

  badge.className = caps || webglRenderer ? 'badge ok' : 'badge no';
  badge.textContent = gpuLabel;

  // Render loop: GPU renderer every frame; CPU renderer on demand.
  const gpuDevice = caps?.device ?? null;
  let running = false;
  const renderFallback = () => {
    if (webglRenderer) {
      webglRenderer.render(
        animating ? human.skinScene() : morphedPositions(human),
        animating ? human.skinNormals() : human.canonicalRef.baseGeometry().normals,
      );
      return;
    }
    canvasRenderer.render(human, animating ? human.skinScene() : undefined);
  };

  function loop() {
    if (caps && ctx && gpuDevice) {
      const texture = (ctx as GPUCanvasContext).getCurrentTexture();
      const buf = human.encodeFrame(texture.createView(), texture.width, texture.height);
      if (buf) {
        gpuDevice.queue.submit([buf]);
        running = true;
        requestAnimationFrame(loop);
        return;
      }
      running = false;
    }
  }

  const refresh = (msg: string) => {
    log.textContent = `${msg}\n\n${human.profiler.summarize()}\n\nengine: ${gpuLabel}`;
    timelineInfo.textContent = `events: ${human.historyLength} · index: ${human.historyIndex} · undo/redo ready`;
    if (!caps || !ctx || !running) {
      // WebGL2 fallback uses CPU morph/skinning buffers; 2D canvas is last resort.
      renderFallback();
    }
  };

  // ---- Skeletal animation (Phase 4): a waving-arm clip sampled each frame.
  let animating = false;
  let animTime = 0;
  human.addClip('wave', [
    {
      bone: 'clavicle_l',
      times: [0, 1],
      rotations: [quatFromEuler(0, 0, 0), quatFromEuler(-20, 0, 10)],
    },
    {
      bone: 'upperarm_l',
      times: [0, 0.5, 1],
      rotations: [quatFromEuler(0, 0, -10), quatFromEuler(0, 0, -90), quatFromEuler(0, 0, -10)],
    },
    {
      bone: 'forearm_l',
      times: [0, 0.5, 1],
      rotations: [quatFromEuler(0, 0, -20), quatFromEuler(0, 0, 30), quatFromEuler(0, 0, -20)],
    },
  ]);
  human.playClip('wave', 1);
  document.getElementById('animate')?.addEventListener('click', () => {
    animating = !animating;
    animTime = 0;
    if (!animating) {
      human.setPose([]);
      renderFallback();
    }
    refresh(animating ? 'ANIMATING: wave clip (skinned)' : 'ANIMATION stopped');
    if (animating && !running) requestAnimationFrame(animLoop);
  });
  document.getElementById('raiseHand')?.addEventListener('click', () => {
    animating = false;
    refresh(formatResult('perform', human.perform('raise your right hand')));
  });
  document.getElementById('lookCamera')?.addEventListener('click', () => {
    animating = false;
    refresh(formatResult('perform', human.perform('look toward the camera')));
  });
  function animLoop(now: number) {
    if (!animating) return;
    animTime = (now / 1000) % 1;
    human.animate(animTime);
    renderFallback();
    if (!running) requestAnimationFrame(animLoop);
  }

  refresh('ready');
  renderFallback();
  if (caps && ctx) requestAnimationFrame(loop);

  bindRange('nose', 'noseV', (v) =>
    refresh(formatResult('nose', human.modify({ 'face.nose.width': v }))),
  );
  bindRange('jaw', 'jawV', (v) =>
    refresh(formatResult('jaw', human.modify({ 'face.jaw.width': v }))),
  );
  bindRange('musc', 'muscV', (v) =>
    refresh(formatResult('muscularity', human.modify({ 'body.muscularity': v }))),
  );
  bindRange('height', 'heightV', (v) =>
    refresh(formatResult('height', human.modify({ 'global.height': v }))),
  );
  bindRange('waist', 'waistV', (v) =>
    refresh(formatResult('waist', human.modify({ 'body.waist': v }))),
  );
  bindRange('shoulders', 'shoulderV', (v) =>
    refresh(formatResult('shoulders', human.modify({ 'skeleton.shoulderWidth': v }))),
  );

  function runPrompt(text: string) {
    const r = human.prompt(text);
    refresh(`PROMPT: "${text}"\n${formatResult('ai', r)}`);
  }

  document.getElementById('go')?.addEventListener('click', () => {
    runPrompt((document.getElementById('prompt') as HTMLInputElement).value);
  });
  (document.getElementById('prompt') as HTMLInputElement).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runPrompt((e.target as HTMLInputElement).value);
  });
  document
    .getElementById('preset')
    ?.addEventListener('click', () => runPrompt('make the nose narrower'));

  document.getElementById('undo')?.addEventListener('click', () => {
    human.undo();
    refresh('UNDO');
  });
  document.getElementById('redo')?.addEventListener('click', () => {
    human.redo();
    refresh('REDO');
  });
  document.getElementById('snap')?.addEventListener('click', () => {
    human.snapshot();
    refresh('SNAPSHOT taken');
  });

  document
    .getElementById('smile')
    ?.addEventListener('click', () =>
      refresh(formatResult('smile', human.setExpression('smile', 1))),
    );
  document
    .getElementById('surprise')
    ?.addEventListener('click', () =>
      refresh(formatResult('surprise', human.setExpression('surprise', 1))),
    );
  document
    .getElementById('neutral')
    ?.addEventListener('click', () =>
      refresh(formatResult('neutral', human.setExpression('neutral', 1))),
    );

  refresh('ready');
  renderFallback();
  if (caps && ctx) requestAnimationFrame(loop);
}

main().catch((err) => {
  const log = document.getElementById('log') as HTMLElement;
  log.textContent = `ERROR: ${err?.message ?? err}`;
});

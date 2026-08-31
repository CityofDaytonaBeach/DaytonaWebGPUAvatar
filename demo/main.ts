import { Human, KernelWork, createDeviceAndProfile } from "../src";
import type { DeviceCapabilities } from "../src";

// Part colors mirror the GPU renderer's per-part materials.
function partColor(name: string, kind: string): string {
  if (kind === "sclera") return "#eef0f2";
  if (kind === "iris") return name.startsWith("pupil") ? "#141114" : "#5a854f";
  if (kind === "teeth") return "#ebe7d8";
  if (kind === "tongue") return "#d07f75";
  if (kind === "mouth_cavity") return "#2f1618";
  return "#b98f73"; // skin
}

// ---------------------------------------------------------------------------
// Minimal 2D canvas renderer for the canonical block human. It reads the
// canonical vertices + the Human's accumulated morph deltas (CPU reference
// path) and draws the body plus each detail part (eyes/teeth/tongue/cavity)
// in its own color. Shows that only affected geometry moves on each edit.
// ---------------------------------------------------------------------------
class CanvasHumanRenderer {
  constructor(private canvas: HTMLCanvasElement) {}

  render(human: Human) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);

    const canonical = human.canonicalRef;
    const vertices = canonical.vertices;
    const delta = human.computeMorphDelta();

    const proj = (x: number, y: number): [number, number] => {
      const sx = (x + 1.3) / 2.6 * w;
      const sy = (1.9 - y) / 3.3 * h;
      return [sx, sy];
    };

    const drawRange = (start: number, count: number, color: string) => {
      const idx = canonical.indices;
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let i = start; i < start + count; i += 3) {
        if (i + 2 >= start + count) break;
        const a = vertices[idx[i]];
        const b = vertices[idx[i + 1]];
        const c = vertices[idx[i + 2]];
        const [ax, ay] = proj(a.position.x + delta[a.id * 3], a.position.y + delta[a.id * 3 + 1]);
        const [bx, by] = proj(b.position.x + delta[b.id * 3], b.position.y + delta[b.id * 3 + 1]);
        const [cx, cy] = proj(c.position.x + delta[c.id * 3], c.position.y + delta[c.id * 3 + 1]);
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    };

    // Body: all triangles before the first detail part.
    const bodyEnd = canonical.parts.length > 0 ? canonical.parts[0].indexStart : canonical.indices.length;
    drawRange(0, bodyEnd, partColor("body", "skin"));
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
    ctx.fillStyle = "rgba(255,170,90,1)";
    for (const b of bones) {
      const [jx2, jy2] = [worldPos.get(b.name)![0], worldPos.get(b.name)![1]];
      const [sxp, syp] = proj(jx2, jy2);
      ctx.beginPath();
      ctx.arc(sxp, syp, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Anatomy summary.
    const dims = human.solveAnatomy();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "9px monospace";
    const parts = canonical.parts.map((p) => p.name).join(", ");
    ctx.fillText(`parts: body · ${parts}`, 10, h - 12);
    ctx.fillText(
      `anatomy: ${dims.height.toFixed(2)}m · hips ${dims.hipHeight.toFixed(2)} · sh ${dims.shoulderHeight.toFixed(2)} · score ${human.anatomyScore().toFixed(2)}`,
      10,
      h - 24
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
  el.addEventListener("input", () => {
    const num = Number(el.value);
    val.textContent = (num / 100).toFixed(2);
    onInput(num / 100);
  });
}

function formatResult(tag: string, r: ModifyResultLike): string {
  if (r.cancelled) return `[${tag}] CANCELLED: ${r.reason}`;
  const kinds = r.affectedKernelWork.map((k) => k.kind).join(", ");
  return `[${tag}] ok\nkernels: ${kinds || "(expression/timing)"}\ndirty: ${r.dirtyRegions.join(", ") || "none"}\n→ GPU-resident, minimal compute only`;
}

async function main() {
  const canvas = document.getElementById("viewport") as HTMLCanvasElement;
  const log = document.getElementById("log") as HTMLElement;
  const timelineInfo = document.getElementById("timelineInfo") as HTMLElement;
  const badge = document.createElement("span");
  badge.className = "badge";
  const title = document.querySelector("h1");
  if (title) title.appendChild(document.createTextNode(" ")).after(badge);

  // Try to bring up a WebGPU device. On success the mesh is rendered by the
  // GPU-resident morph + render pipeline; otherwise we fall back to the 2D CPU
  // canvas renderer (reference path).
  let caps: DeviceCapabilities | null = null;
  let ctx: GPUCanvasContext | null = null;
  let gpuLabel = "WebGPU unavailable — using CPU canvas renderer";
  try {
    caps = await createDeviceAndProfile();
    ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (ctx && "configure" in ctx!) {
      ctx.configure({
        device: caps.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "opaque",
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
    seed: { "global.height": 1.78, "body.waist": 1.0, "skeleton.shoulderWidth": 1.0, "body.muscularity": 0.48 },
  });
  const canvasRenderer = new CanvasHumanRenderer(canvas);
  badge.className = caps ? "badge ok" : "badge no";
  badge.textContent = gpuLabel;

  // Render loop: GPU renderer every frame; CPU renderer on demand.
  const gpuDevice = caps?.device ?? null;
  let running = false;
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
      // CPU reference renderer (also used when GPU present but a frame in flight).
      canvasRenderer.render(human);
    }
  };

  bindRange("nose", "noseV", (v) => refresh(formatResult("nose", human.modify({ "face.nose.width": v }))));
  bindRange("jaw", "jawV", (v) => refresh(formatResult("jaw", human.modify({ "face.jaw.width": v }))));
  bindRange("musc", "muscV", (v) => refresh(formatResult("muscularity", human.modify({ "body.muscularity": v }))));
  bindRange("height", "heightV", (v) => refresh(formatResult("height", human.modify({ "global.height": v }))));
  bindRange("waist", "waistV", (v) => refresh(formatResult("waist", human.modify({ "body.waist": v }))));
  bindRange("shoulders", "shoulderV", (v) => refresh(formatResult("shoulders", human.modify({ "skeleton.shoulderWidth": v }))));

  function runPrompt(text: string) {
    const r = human.prompt(text);
    refresh(`PROMPT: "${text}"\n${formatResult("ai", r)}`);
  }

  document.getElementById("go")?.addEventListener("click", () => {
    runPrompt((document.getElementById("prompt") as HTMLInputElement).value);
  });
  (document.getElementById("prompt") as HTMLInputElement).addEventListener("keydown", (e) => {
    if (e.key === "Enter") runPrompt((e.target as HTMLInputElement).value);
  });
  document.getElementById("preset")?.addEventListener("click", () => runPrompt("make the nose narrower"));

  document.getElementById("undo")?.addEventListener("click", () => { human.undo(); refresh("UNDO"); });
  document.getElementById("redo")?.addEventListener("click", () => { human.redo(); refresh("REDO"); });
  document.getElementById("snap")?.addEventListener("click", () => { human.snapshot(); refresh("SNAPSHOT taken"); });

  document.getElementById("smile")?.addEventListener("click", () => refresh(formatResult("smile", human.setExpression("smile", 1))));
  document.getElementById("surprise")?.addEventListener("click", () => refresh(formatResult("surprise", human.setExpression("surprise", 1))));
  document.getElementById("neutral")?.addEventListener("click", () => refresh(formatResult("neutral", human.setExpression("neutral", 1))));

  refresh("ready");
  canvasRenderer.render(human);
  if (caps && ctx) requestAnimationFrame(loop);
}

main().catch((err) => {
  const log = document.getElementById("log") as HTMLElement;
  log.textContent = `ERROR: ${err?.message ?? err}`;
});

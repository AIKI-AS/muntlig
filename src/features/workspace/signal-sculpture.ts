import { fragmentShader, vertexShader } from "./signal-shaders";

const STRIPS = 64;
const SEGMENTS = 160;
const PARTICLES = 2600;
export interface SignalSculpture {
  setPaused(paused: boolean): void;
  dispose(): void;
}

function programFor(gl: WebGLRenderingContext) {
  const program = gl.createProgram();
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  if (!program || !vertex || !fragment) {
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    return null;
  }
  for (const [shader, source] of [[vertex, vertexShader], [fragment, fragmentShader]] as const) {
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return null;
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
}

function ribbonMesh() {
  const vertices = new Float32Array(STRIPS * (SEGMENTS + 1) * 6);
  const indices = new Uint16Array(STRIPS * SEGMENTS * 6);
  let vertex = 0;
  let index = 0;
  for (let strip = 0; strip < STRIPS; strip++) {
    for (let step = 0; step <= SEGMENTS; step++) {
      for (let side = 0; side < 2; side++) {
        vertices[vertex++] = step / SEGMENTS;
        vertices[vertex++] = -1 + (strip + side * 0.76) * 2 / STRIPS;
        vertices[vertex++] = strip / STRIPS;
      }
      if (step === SEGMENTS) continue;
      const at = strip * (SEGMENTS + 1) * 2 + step * 2;
      indices.set([at, at + 1, at + 2, at + 1, at + 3, at + 2], index);
      index += 6;
    }
  }
  return { vertices, indices };
}

/** Local, decorative renderer. No microphone, network, timers or React updates per frame. */
export function mountSignalSculpture(canvas: HTMLCanvasElement): SignalSculpture | null {
  if (typeof ResizeObserver === "undefined" || typeof IntersectionObserver === "undefined" || typeof queueMicrotask === "undefined") return null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  if (typeof reduced.addEventListener !== "function") return null;
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power" });
  if (!gl || !gl.getExtension("OES_standard_derivatives")) return null;
  const program = programFor(gl);
  if (!program) return null;
  const meshBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  const particleBuffer = gl.createBuffer();
  const buffers = [meshBuffer, indexBuffer, particleBuffer];
  if (buffers.some((buffer) => !buffer)) {
    buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    gl.deleteProgram(program);
    return null;
  }
  const mesh = ribbonMesh();
  gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  const points = new Float32Array(PARTICLES * 3);
  for (let at = 0; at < PARTICLES; at++) {
    points[at * 3] = ((at * 0.754877666) % 1) * 2.2 - 1.1;
    points[at * 3 + 1] = ((at * 0.569840296) % 1) * 2.2 - 1.1;
    points[at * 3 + 2] = (at * 0.438289) % 1;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
  gl.useProgram(program);
  const attribute = gl.getAttribLocation(program, "a_data");
  gl.enableVertexAttribArray(attribute);
  const uniforms = Object.fromEntries(
    ["size", "pointer", "time", "layer", "density", "foil", "mid", "shade"].map((name) =>
      [name, gl.getUniformLocation(program, `u_${name}`)]),
  );
  const style = getComputedStyle(canvas);
  for (const name of ["foil", "mid", "shade"] as const) {
    const hex = style.getPropertyValue(`--signal-${name}`).trim();
    gl.uniform3f(uniforms[name], parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
  }
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  // Match straight-alpha shader colors to the premultiplied canvas.
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let frameId = 0;
  let lastFrame = 0;
  let time = 0;
  let x = 0;
  let y = 0;
  let targetX = 0;
  let targetY = 0;
  let inView = true;
  let disposed = false;
  let lost = false;
  let formFocused = false;
  let paused = false;

  function motionState(state: string) {
    if (canvas.dataset.motion !== state) canvas.dataset.motion = state;
  }
  function paint() {
    if (!gl) return;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform2f(uniforms.pointer, x, y);
    gl.uniform1f(uniforms.time, time);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.uniform1f(uniforms.layer, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
    gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, PARTICLES);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.uniform1f(uniforms.layer, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
    gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    if (canvas.dataset.renderer !== "webgl") canvas.dataset.renderer = "webgl";
  }
  function requestFrame() {
    if (!frameId && !disposed && !lost && inView && !document.hidden) frameId = requestAnimationFrame(frame);
  }
  function frame(now: number) {
    frameId = 0;
    if (disposed || lost || !inView || document.hidden) return;
    const reduceMotion = reduced.matches;
    if (reduceMotion) x = y = targetX = targetY = 0;
    const allowed = !reduceMotion && !formFocused && !paused;
    const elapsed = lastFrame ? now - lastFrame : 1000 / 60;
    if (allowed && elapsed < 1000 / 60) {
      requestFrame();
      return;
    }
    const dt = Math.min(elapsed, 50);
    lastFrame = now;
    if (allowed) {
      time += dt / 1000;
      const follow = 1 - Math.exp(-dt / 110);
      x += (targetX - x) * follow;
      y += (targetY - y) * follow;
    }
    paint();
    motionState(reduceMotion ? "reduced" : paused ? "paused" : formFocused ? "focused" : "running");
    if (allowed) requestFrame();
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !gl) return;
    const density = Math.min(devicePixelRatio || 1, 1.75, 1600 / Math.max(bounds.width, bounds.height));
    canvas.width = Math.round(bounds.width * density);
    canvas.height = Math.round(bounds.height * density);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.size, bounds.width, bounds.height);
    gl.uniform1f(uniforms.density, density);
    requestFrame();
  }
  function pointer(event: PointerEvent) {
    if (!fine.matches || event.pointerType !== "mouse" || reduced.matches || formFocused || paused) return;
    const bounds = canvas.getBoundingClientRect();
    targetX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    targetY = Math.max(-1, Math.min(1, (0.5 - (event.clientY - bounds.top) / bounds.height) * 2));
  }
  function leave() {
    targetX = targetY = 0;
  }
  function visibility() {
    cancelAnimationFrame(frameId);
    frameId = lastFrame = 0;
    if (document.hidden || !inView) motionState("hidden");
    else requestFrame();
  }
  function preference() {
    requestFrame();
  }
  function focus() {
    formFocused = !!document.activeElement?.closest(".auth-form-area form, .auth-form-area details");
    lastFrame = 0;
    requestFrame();
  }
  function focusOut() { queueMicrotask(focus); }
  function contextLost(event: Event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frameId);
    frameId = 0;
    canvas.dataset.renderer = "fallback";
    motionState("still");
  }
  const sizeObserver = new ResizeObserver(resize);
  const viewObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    visibility();
  });
  sizeObserver.observe(canvas);
  viewObserver.observe(canvas);
  canvas.addEventListener("pointermove", pointer, { passive: true });
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("webglcontextlost", contextLost);
  reduced.addEventListener("change", preference);
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", focusOut);
  resize();
  focus();
  return {
    setPaused(value: boolean) {
      paused = value;
      visibility();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      sizeObserver.disconnect();
      viewObserver.disconnect();
      canvas.removeEventListener("pointermove", pointer);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("webglcontextlost", contextLost);
      reduced.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focusOut);
      buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      gl.deleteProgram(program);
      delete canvas.dataset.renderer;
      delete canvas.dataset.motion;
    },
  };
}

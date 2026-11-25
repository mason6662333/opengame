import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { deflateSync } from 'node:zlib';
import { browserExecutable } from '../browser.ts';
import { GameProjects, buildPlaytestContactSheet, gamePlaytestAssertions, normalizeSelfTestAssertions, validateGameScript } from '../game-projects.ts';
import { AssetLibrary } from '../gateway/asset-library.ts';
import { assetOperation } from '../gateway/asset-operations.ts';
import { readLibraryAsset } from '../gateway/asset-read.ts';
import { optimizeGlbTexturesForPublish } from '../gateway/glb-optimize.ts';
import { buildPublishBundle } from '../gateway/web-publish-bundle.ts';
import { inspectGlb } from '../scripts/game-glb-inspect.mjs';
import { WorkspaceStore } from '../workspace.ts';

const execFileAsync = promisify(execFile);

/** Pure-Node RGB PNG generator for deterministic GLB/WebP compression tests. */
function makeSyntheticPng(width: number, height: number): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB opaque
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  let seed = 1337;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed >>> 24) & 0x3f;
      const idx = row + 1 + x * 3;
      raw[idx] = Math.min(255, ((x * 255) / width) | 0 ^ noise);
      raw[idx + 1] = Math.min(255, ((y * 255) / height) | 0 ^ (noise >> 1));
      raw[idx + 2] = Math.min(255, (((x + y) * 127) / (width + height)) | 0 ^ noise);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Builds a valid 1-triangle GLB 2 binary with an embedded PNG texture and optional BLEND material. */
function makeSyntheticGlb(pngBytes: Buffer, options: { blendMaterial?: boolean } = {}): Buffer {
  // 3 vertices (VEC3 float32 = 36 bytes) forming a triangle resting at y = 0..2.
  const pos = Buffer.alloc(36);
  const verts = [0, 0, 0, 1.5, 0, 0, 0.75, 2.0, 0.5];
  verts.forEach((v, i) => pos.writeFloatLE(v, i * 4));
  const imgPad = (4 - (pngBytes.length % 4)) % 4;
  const bin = Buffer.concat([pos, pngBytes, Buffer.alloc(imgPad)]);

  const doc = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'HeroRoot', mesh: 0, rotation: [0, 1, 0, 0] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.length },
      { buffer: 0, byteOffset: pos.length, byteLength: pngBytes.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1.5, 2.0, 0.5] },
    ],
    images: [{ name: 'albedo', mimeType: 'image/png', bufferView: 1 }],
    textures: [{ source: 0 }],
    materials: [
      {
        name: 'BodyMat',
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
        ...(options.blendMaterial ? { alphaMode: 'BLEND' } : {}),
      },
    ],
    meshes: [{ name: 'HeroMesh', primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  };
  const jsonRaw = Buffer.from(JSON.stringify(doc), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonChunk.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonChunk, bh, bin]);
}

async function withWorkspace(fn: (workspace: string, service: GameProjects) => Promise<void>) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'opengame-generalized-'));
  try {
    const service = new GameProjects(workspace, path.join(workspace, 'templates'), path.resolve('templates/game-kits'));
    await fn(workspace, service);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

test('H3: game-glb-inspect reports bounds, texture ratio, alphaMode BLEND, root transforms and advisories', async () => {
  const png = makeSyntheticPng(384, 384);
  const glb = makeSyntheticGlb(png, { blendMaterial: true });
  const info = inspectGlb(glb);
  assert.equal(info.triangleCount, 1);
  assert.equal(info.totalBytes, glb.length);
  assert.deepEqual(info.bounds, { min: [0, 0, 0], max: [1.5, 2, 0.5], size: [1.5, 2, 0.5], minY: 0 });
  assert.equal(info.images.length, 1);
  assert.equal(info.images[0].mimeType, 'image/png');
  assert.equal(info.images[0].bytes, png.length);
  assert.ok(info.textureRatio > 0.8);
  assert.deepEqual(info.materials.blendMaterials, ['BodyMat']);
  assert.equal(info.rootTransforms?.length, 1);
  assert.ok(info.advisories?.some((a: string) => /alphaMode=BLEND/.test(a)));
  assert.ok(info.advisories?.some((a: string) => /EXT_texture_webp/.test(a)));

  // Existing bundled KayKit models keep full compatibility plus new diagnostics.
  const knight = inspectGlb(await readFile(path.resolve('templates/game-kits/characters/Knight.glb')));
  assert.equal(knight.triangleCount, 6952);
  assert.equal(knight.boneCount, 41);
  assert.ok(knight.bounds && knight.bounds.size[1] > 1);
  assert.equal(knight.totalBytes > 100000, true);
});

test('H1: adaptive validation supports modular solo ESM games without logic.js and catches broken local imports', () =>
  withWorkspace(async (_workspace, service) => {
    const { game } = await service.create({
      prompt: 'Open island 3D sandbox exploration',
      genre: 'casual',
      style: '3d',
      setting: 'fantasy',
      multiplayer: false,
    });
    // Replace entry with modular ESM under src/ without importing logic.js.
    await service.write(game.id, [
      {
        path: 'index.html',
        content: '<!doctype html><canvas id="game"></canvas><script type="module" src="./src/main.js"></script>',
      },
      {
        path: 'src/main.js',
        content: 'import { WORLD_SIZE } from "./world.js"; window.__omGame = { getState: () => ({ selfId: "p1", players: { p1: { connected: true, x: 0, z: 0 } }, phase: "explore", worldSize: WORLD_SIZE }) };',
      },
      {
        path: 'src/world.js',
        content: 'export const WORLD_SIZE = 120;',
      },
    ]);
    // Untouched starter logic.js on disk is ignored (no false starter warning), and deleting logic.js also passes.
    const validWithUnusedStarter = await service.validate(game.id);
    assert.equal(validWithUnusedStarter.passed, true, JSON.stringify(validWithUnusedStarter));
    assert.equal(validWithUnusedStarter.warnings.some(w => /starter kit/.test(w)), false);

    await rm(path.join(service.root, game.id, 'logic.js'));
    const validWithoutLogic = await service.validate(game.id);
    assert.equal(validWithoutLogic.passed, true, JSON.stringify(validWithoutLogic));

    // Calling simulate on a game without logic.js gives clear guidance.
    await assert.rejects(
      service.simulate(game.id, { players: 1, scripts: 'idle', maxTicks: 100 }),
      /openmotion_game_playtest.*runSelfTests/,
    );

    // Missing relative import or disallowed host inside src/world.js is caught by validate.
    await service.write(game.id, [
      { path: 'src/world.js', content: 'import "./missing.js"; fetch("https://evil.example/a"); export const WORLD_SIZE = 120;' },
    ]);
    const broken = await service.validate(game.id);
    assert.equal(broken.passed, false);
    assert.ok(broken.diagnostics.some(d => d.path === 'src/world.js' && /missing\.js/.test(d.message)));
    assert.ok(broken.diagnostics.some(d => d.path === 'src/world.js' && /evil\.example/.test(d.message)));
  }));

test('H2: validateGameScript supports screenshot & action inputs and gamePlaytestAssertions flattens runSelfTests & sandbox phases', () => {
  const script = validateGameScript([
    { type: 'screenshot', label: 'entry_ready' },
    { type: 'action', action: { type: 'setCamera', view: 'back' } },
    { type: 'key', key: 'w', event: 'down' },
    { type: 'wait', ms: 200 },
    { type: 'key', key: 'w', event: 'up' },
    { type: 'screenshot', label: 'after_move' },
  ]);
  assert.equal(script.length, 6);
  assert.throws(() => validateGameScript([{ type: 'screenshot', label: '../bad' }]), /Screenshot labels/);
  assert.throws(() => validateGameScript([{ type: 'action', action: null as any }]), /JSON object/);
  assert.throws(() => validateGameScript([{ type: 'action', action: [] as any }]), /JSON object/);
  assert.throws(
    () => validateGameScript([{ type: 'action', action: { blob: 'x'.repeat(17000) } }]),
    /at most 16 KiB/,
  );
  assert.throws(
    () => validateGameScript(Array.from({ length: 9 }, (_, i) => ({ type: 'screenshot', label: `s${i}` }))),
    /at most 8 screenshot/,
  );

  const normalized = normalizeSelfTestAssertions({
    wallCollision: { pass: true, detail: 'blocked cleanly' },
    coverUnmount: { pass: false, detail: 'overlay still in DOM' },
  });
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].name, 'selfTest:wallCollision');
  assert.equal(normalized[0].passed, true);
  assert.equal(normalized[1].name, 'selfTest:coverUnmount');
  assert.equal(normalized[1].passed, false);
  assert.equal(normalized[1].reason, 'overlay still in DOM');

  const assertions = gamePlaytestAssertions({
    before: { state: { selfId: 'p1', players: { p1: { x: 0, z: 0 } } } },
    after: { state: { selfId: 'p1', phase: 'explore', players: { p1: { connected: true, x: 3, z: 0 } } } },
    clients: 1,
    script,
    mobile: { width: 390, height: 844, scrollWidth: 390, overflowElements: [] },
    selfTests: { physicsFinite: { pass: true } },
  });
  assert.equal(assertions.find(a => a.name === 'phase')?.passed, true);
  assert.equal(assertions.find(a => a.name === 'selfTest:physicsFinite')?.passed, true);
});

test('H2 (live headless): playtest waits for phase loading->ready, captures mid-script screenshots and runs __omGame.runSelfTests()', async t => {
  if (!await browserExecutable().catch(() => undefined)) {
    t.skip('Local Chrome unavailable');
    return;
  }
  await withWorkspace(async (_workspace, service) => {
    const { game } = await service.create({
      prompt: 'Async loading 3D sandbox test',
      genre: 'casual',
      style: '3d',
      setting: null,
      multiplayer: false,
    });
    await service.write(game.id, [
      {
        path: 'index.html',
        content: `<!doctype html><html><body style="margin:0;overflow:hidden">
<canvas id="game" width="1280" height="720" style="display:block;width:100vw;height:100vh"></canvas>
<div id="cover" style="position:fixed;inset:0;background:#112233;color:#fff"><button id="start" disabled>Loading...</button></div>
<script type="module" src="./src/main.js"></script></body></html>`,
      },
      {
        path: 'src/main.js',
        content: `
let phase = 'loading';
let px = 0;
let diagnosticStage = 'idle';
const btn = document.getElementById('start');
const cover = document.getElementById('cover');
const ctx = document.getElementById('game').getContext('2d');
ctx.fillStyle = '#224466'; ctx.fillRect(0, 0, 1280, 720);
setTimeout(() => { phase = 'ready'; btn.disabled = false; btn.textContent = 'Enter'; }, 250);
btn.addEventListener('click', () => { phase = 'explore'; cover.remove(); });
addEventListener('keydown', e => { if (phase === 'explore' && (e.key === 'd' || e.key === 'D')) px += 2; });
window.__omGame = {
  getState: () => ({ selfId: 'p1', phase, diagnosticStage, players: { p1: { connected: true, x: px, z: 0 } } }),
  getStats: () => ({ drawCalls: 1, triangles: 240, entities: 1 }),
  sendAction: (action) => {
    if (action?.type === 'setStage' && typeof action.stage === 'string') {
      diagnosticStage = action.stage;
      ctx.fillStyle = '#662244'; ctx.fillRect(0, 0, 1280, 720);
    }
  },
  runSelfTests: () => ({
    coverUnmounted: { pass: !document.getElementById('cover'), detail: document.getElementById('cover') ? 'still mounted' : 'removed' },
    finitePos: { pass: Number.isFinite(px), detail: String(px) },
  }),
};`,
      },
    ]);

    const result = await service.playtest(game.id, {
      clients: 1,
      durationMs: 300,
      waitForReadyMs: 5000,
      scripts: [[
        { type: 'screenshot', label: 'after_entry' },
        { type: 'action', action: { type: 'setStage', stage: 'boss_phase2' } },
        { type: 'key', key: 'd', event: 'press' },
        { type: 'wait', ms: 80 },
        { type: 'screenshot', label: 'boss_phase2' },
      ]],
    });
    const client = result.clients[0];
    assert.deepEqual(client.consoleErrors, []);
    assert.deepEqual(client.failedRequests, []);
    assert.equal(client.screenshots?.length, 2);
    assert.equal(client.screenshots?.[0].label, 'after_entry');
    assert.equal(client.screenshots?.[1].label, 'boss_phase2');
    assert.equal(client.authoritative?.state?.diagnosticStage, 'boss_phase2');
    assert.equal(client.authoritative?.stats?.drawCalls, 1);
    if (client.contactSheetPath) {
      const sheetBytes = await readFile(client.contactSheetPath);
      assert.ok(sheetBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'contactSheetPath should be a valid PNG');
      assert.match(client.contactSheetLegend ?? '', /r1c1=after_entry/);
      assert.match(client.contactSheetLegend ?? '', /r1c2=boss_phase2/);
    }
    const missingSheet = await buildPlaytestContactSheet(client.screenshots!, path.join(service.root, 'missing-sheet.png'), {
      ffmpeg: '/nonexistent/ffmpeg-binary',
    });
    assert.equal(missingSheet, null, 'buildPlaytestContactSheet should degrade gracefully when ffmpeg is unavailable');
    assert.equal(client.assertions.find((a: any) => a.name === 'phase')?.passed, true);
    assert.equal(client.assertions.find((a: any) => a.name === 'scriptedMovement')?.passed, true);
    assert.equal(client.assertions.find((a: any) => a.name === 'selfTest:coverUnmounted')?.passed, true);
    assert.equal(client.assertions.find((a: any) => a.name === 'selfTest:finitePos')?.passed, true);
  });
});

test('Option B + H4: AssetLibrary imports/reads local .glb, buildPublishBundle optimizes GLB textures to EXT_texture_webp, and exportZip produces runnable offline bundle', () =>
  withWorkspace(async (workspace, service) => {
    const store = new WorkspaceStore(workspace);
    const library = new AssetLibrary(store);

    // 1. Create a synthetic GLB with large embedded PNG and import into AssetLibrary.
    const png = makeSyntheticPng(512, 512);
    const glbBytes = makeSyntheticGlb(png);
    const glbPath = path.join(workspace, 'hero.glb');
    await writeFile(glbPath, glbBytes);

    const { asset } = await assetOperation(store, {
      action: 'import',
      requestId: 'import-hero-glb-1',
      sourcePath: glbPath,
      name: 'Hero Model',
    });
    assert.equal(asset.modality, '3d');
    const version = asset.versions[0];
    assert.equal(version.mimeType, 'model/gltf-binary');
    assert.equal(version.filename, 'media.glb');
    assert.equal((version.result?.glb as any)?.triangleCount, 1);

    // 1b. Generated 3D versions carrying provider result metadata still keep authoritative local GLB inspection.
    const generatedPrepared = await library.prepare(glbPath);
    const generatedAsset = await store.lock(() => library.addLocked(generatedPrepared, {
      name: 'Generated Boss',
      expectedModality: '3d',
      version: {
        source: 'generated',
        name: 'Generated Boss',
        result: { providerJobId: 'tripo-job-1', qualityTier: 'high', glb: 'stale-provider-summary' },
      },
    }));
    const generatedVersion = generatedAsset.versions[0];
    assert.equal((generatedVersion.result as any)?.providerJobId, 'tripo-job-1');
    assert.equal((generatedVersion.result as any)?.qualityTier, 'high');
    assert.equal((generatedVersion.result?.glb as any)?.triangleCount, 1);

    // 2. Listing by modality:'3d' and reading via readLibraryAsset work cleanly.
    const listed = await library.list({ modality: '3d' });
    assert.equal(listed.assets.length, 2);
    assert.ok(listed.assets.some(a => a.id === asset.id));
    assert.ok(listed.assets.some(a => a.id === generatedAsset.id));
    const readRes = await readLibraryAsset(library, { assetId: asset.id, versionId: version.id });
    assert.equal(readRes.modality, '3d');
    assert.match((readRes.content[0] as any).text, /3D GLB model/);

    // 3. Verify graceful fallback when no WebP encoder is present, then deterministic EXT_texture_webp optimization.
    const prevCwebp = process.env.CWEBP_PATH;
    const prevFfmpeg = process.env.HYPERFRAMES_FFMPEG_PATH;
    try {
      process.env.CWEBP_PATH = path.join(workspace, 'missing-cwebp');
      process.env.HYPERFRAMES_FFMPEG_PATH = path.join(workspace, 'missing-ffmpeg');
      const fallbackOpt = await optimizeGlbTexturesForPublish(glbBytes);
      assert.equal(fallbackOpt.optimized, false);
      assert.equal(fallbackOpt.data.length, glbBytes.length);

      // Deterministic cwebp test wrapper (same pattern as tests/web-publish.test.ts) so CI passes regardless of host codecs.
      const fakeCwebp = path.join(workspace, 'fake-cwebp.mjs');
      await writeFile(
        fakeCwebp,
        `#!${process.execPath}\nimport fs from 'node:fs';\nconst out = process.argv[process.argv.indexOf('-o') + 1];\nconst payload = Buffer.from('524946461a000000574542505650384c0d0000002f00000010071011118888fe0700', 'hex');\nfs.writeFileSync(out, payload);\n`,
      );
      await chmod(fakeCwebp, 0o755);
      process.env.CWEBP_PATH = fakeCwebp;

      const opt = await optimizeGlbTexturesForPublish(glbBytes);
      assert.equal(opt.optimized, true, 'Expected cwebp encoder to optimize embedded PNG inside GLB');
      assert.equal(opt.convertedImages, 1);
      assert.ok(opt.savedBytes > png.length * 0.5, `Expected significant savings, got ${opt.savedBytes}`);
      const optInfo = inspectGlb(opt.data);
      assert.equal(optInfo.triangleCount, 1);
      assert.deepEqual(optInfo.bounds, inspectGlb(glbBytes).bounds);
      assert.equal(optInfo.images[0].mimeType, 'image/webp');
      assert.ok(optInfo.extensionsUsed.includes('EXT_texture_webp'));

      // 4. Game referencing library .glb + assets-raw master -> buildPublishBundle & exportZip.
      const { game } = await service.create({
        prompt: 'Offline GLB showcase',
        genre: 'casual',
        style: '3d',
        setting: null,
        multiplayer: false,
      });
      const mediaUrl = `/motion-api/assets/${asset.id}/versions/${version.id}/media`;
      await service.write(game.id, [
        { path: 'index.html', content: '<!doctype html><canvas id="game"></canvas><script type="module" src="./src/main.js"></script>' },
        { path: 'src/main.js', content: `export const HERO_URL = "${mediaUrl}";` },
      ]);
      await mkdir(path.join(service.root, game.id, 'assets-raw'), { recursive: true });
      await writeFile(path.join(service.root, game.id, 'assets-raw', 'master-4k.glb'), glbBytes);

      const bundle = await buildPublishBundle({
        dataDirectory: workspace,
        kind: 'game',
        targetId: game.id,
        sourcePath: path.join(service.root, game.id),
        entryPath: 'index.html',
      });
      assert.equal(bundle.files.some(f => f.file.startsWith('assets-raw/')), false, 'assets-raw must be excluded');
      const bundledGlb = bundle.files.find(f => f.file.startsWith('_shared-assets/') && f.file.endsWith('.glb'));
      assert.ok(bundledGlb, 'Library GLB should be bundled into _shared-assets/*.glb');
      assert.ok(bundledGlb.data.length < glbBytes.length * 0.5, 'Bundled library GLB should be WebP-optimized');
      assert.equal(bundle.sizeBreakdown.optimizedGlbCount, 1);
      assert.ok(bundle.sizeBreakdown.savedBytes > 0);
      const rewrittenMain = bundle.files.find(f => f.file === 'src/main.js')!.data.toString('utf8');
      assert.doesNotMatch(rewrittenMain, /\/motion-api\/assets\//);
      assert.match(rewrittenMain, /\.\.\/_shared-assets\/.*\.glb/);

      // 5. exportZip produces an archive with launchers, no design/assets-raw, and a runnable serve.mjs.
      const exported = await service.exportZip(game.id);
      assert.ok(exported.filename.endsWith('.zip'));
      const extractDir = path.join(workspace, 'extracted');
      const zipFile = path.join(workspace, 'game.zip');
      await writeFile(zipFile, exported.data);
      await mkdir(extractDir, { recursive: true });
      await execFileAsync('unzip', ['-q', zipFile, '-d', extractDir]);

      const serveJs = await readFile(path.join(extractDir, 'serve.mjs'), 'utf8');
      assert.match(serveJs, /model\/gltf-binary/);
      assert.ok(await readFile(path.join(extractDir, 'Start-Mac.command'), 'utf8'));
      assert.ok(await readFile(path.join(extractDir, 'Start-Windows.bat'), 'utf8'));
      assert.ok(await readFile(path.join(extractDir, 'PLAY-README.txt'), 'utf8'));
      await assert.rejects(readFile(path.join(extractDir, 'game.json')));
      await assert.rejects(readFile(path.join(extractDir, 'assets-raw', 'master-4k.glb')));

      // Boot serve.mjs on a test port and fetch both index.html and the bundled GLB.
      const port = 18765 + (process.pid % 1000);
      const child = spawn(process.execPath, ['serve.mjs'], {
        cwd: extractDir,
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('serve.mjs timed out')), 5000);
          child.stdout.on('data', chunk => {
            if (String(chunk).includes('Game server running')) {
              clearTimeout(timer);
              resolve();
            }
          });
          child.once('exit', code => {
            clearTimeout(timer);
            reject(new Error(`serve.mjs exited early with ${code}`));
          });
        });
        const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
        assert.equal(htmlRes.status, 200);
        const glbRes = await fetch(`http://127.0.0.1:${port}/${bundledGlb.file}`);
        assert.equal(glbRes.status, 200);
        assert.equal(glbRes.headers.get('content-type'), 'model/gltf-binary');
        const fetchedGlb = Buffer.from(await glbRes.arrayBuffer());
        assert.equal(inspectGlb(fetchedGlb).images[0].mimeType, 'image/webp');
      } finally {
        child.kill('SIGTERM');
      }
    } finally {
      if (prevCwebp === undefined) delete process.env.CWEBP_PATH; else process.env.CWEBP_PATH = prevCwebp;
      if (prevFfmpeg === undefined) delete process.env.HYPERFRAMES_FFMPEG_PATH; else process.env.HYPERFRAMES_FFMPEG_PATH = prevFfmpeg;
    }
  }));

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './fixtures.ts';
import { createTracker, validField, validProperties } from '../tracking/core.ts';
import { omEvents } from '../tracking/events.ts';
import {
  mediaGenerationError,
  safeCapabilityId,
  superAgentError,
  toolInputFields,
  toolResultFields,
} from '../tracking/tool-fields.ts';
import type { HostContext } from '../tracking/host.ts';
import { ModelGateway } from '../gateway/service.ts';
import { Phase1Service } from '../phase1.ts';
import { pluginRoot } from '../hyperframes.ts';
import { ScenarioRuns } from '../gateway/scenario-runs.ts';
import { SuperAgentConversations } from '../gateway/super-agent.ts';
import { resolveCodexTraceSampleRate, shouldSampleCodexTurn } from '../shared/codex-session-tracking.ts';

function fakeTracker() {
  const events: any[] = [];
  const tracking = createTracker({
    registry: omEvents,
    entrypoint: 'mcp',
    enabled: true,
    flushIntervalMs: 0,
    send: async batch => {
      events.push(...batch);
      return 'accepted';
    },
  });
  return { tracking, events };
}

const codexHost: HostContext = {
  host_agent: 'codex',
  host_agent_source: 'mcp_client_info',
  mcp_client_name: 'codex-mcp-client',
  mcp_client_version: '1.2.3',
};

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2dIAAAAASUVORK5CYII=',
  'base64',
);

test('P0-A: media generation worker events carry provider/model/capability/duration/error_code/host_context and redact custom models', () => fixture(async store => {
  const { tracking, events } = fakeTracker();
  const gateway = new ModelGateway(store, {
    tracking,
    detect: async () => [{ id: 'codex', label: 'Codex', installed: true, authenticated: true, imageGeneration: true, available: true, reason: 'ok' }],
    codex: async () => png1x1,
    pollMs: 10,
  });

  // 1) Local agent (codex) success with capabilityId and host_context
  const job = await gateway.submit({
    modality: 'image',
    prompt: 'A minimalist studio poster',
    model: 'codex:image-generation',
    capabilityId: 'relight',
    library: { title: 'Test poster' },
  }, codexHost);
  await gateway.tick();
  for (let i = 0; i < 40; i++) {
    const current = await gateway.getJob(job.id);
    if (current.state === 'completed' || current.state === 'failed') break;
    await new Promise(r => setTimeout(r, 20));
  }
  await tracking.flush();

  const reqEv = events.find(e => e.event === 'media_generation_requested');
  const subEv = events.find(e => e.event === 'media_generation_submitted' && e.properties.job_id === job.id);
  const resEv = events.find(e => e.event === 'media_generation_result' && e.properties.job_id === job.id);

  assert.ok(reqEv, 'expected media_generation_requested');
  assert.equal(reqEv.properties.capability_id, 'relight');
  assert.equal(reqEv.host_context?.host_agent, 'codex');

  assert.ok(subEv, 'expected media_generation_submitted');
  assert.equal(subEv.properties.provider_kind, 'agent');
  assert.equal(subEv.properties.model_provider, 'codex');
  assert.equal(subEv.properties.model_id, 'image-generation');
  assert.equal(subEv.properties.capability_id, 'relight');
  assert.equal(subEv.properties.reference_count, 0);
  assert.equal(subEv.host_context?.host_agent, 'codex');

  assert.ok(resEv, 'expected media_generation_result');
  assert.equal(resEv.properties.job_state, 'completed');
  assert.equal(resEv.properties.provider_kind, 'agent');
  assert.equal(resEv.properties.model_provider, 'codex');
  assert.equal(resEv.properties.model_id, 'image-generation');
  assert.equal(resEv.properties.attempt_kind, 'initial');
  assert.equal(typeof resEv.properties.duration_ms, 'number');
  assert.equal(typeof resEv.properties.queue_wait_ms, 'number');
  assert.equal(resEv.properties.error_code, undefined);
  assert.equal(resEv.host_context?.host_agent, 'codex');

  // 2) Builtin vendor-path model_id validation and gateway retention
  assert.equal(validField('model_id', 'fal-ai/flux/schnell'), true);
  assert.equal(validField('model_id', 'fal-ai/wan/v2.2-a14b/text-to-video'), true);
  assert.equal(validField('model_id', '../invalid'), false);
  assert.equal(validField('model_id', '/etc/passwd'), false);
  assert.equal(validField('model_id', 'https://example.com/model'), false);
  assert.equal(validField('model_id', 'a/b/c/d/e/f'), false);

  const falGateway = new ModelGateway(store, {
    tracking,
    fetcher: async (url, init = {}) => {
      if (init.method === 'POST') return Response.json({ request_id: 'fal-1', status_url: 'https://queue.fal.run/s', response_url: 'https://queue.fal.run/r' });
      if (String(url).endsWith('/s')) return Response.json({ status: 'COMPLETED' });
      return Response.json({ outputs: ['https://cdn.example/out.png'] });
    },
    download: async () => png1x1,
    pollMs: 10,
  });
  await falGateway.configureProvider('fal', { apiKey: 'test-key' });
  const falJob = await falGateway.submit({
    modality: 'image',
    prompt: 'Builtin vendor path model',
    model: 'fal:fal-ai/flux/schnell',
    library: { title: 'Fal poster' },
  }, codexHost);
  await falGateway.tick();
  for (let i = 0; i < 40; i++) {
    const current = await falGateway.getJob(falJob.id);
    if (current.state === 'completed' || current.state === 'failed') break;
    await new Promise(r => setTimeout(r, 20));
  }
  await tracking.flush();
  const falSub = events.find(e => e.event === 'media_generation_submitted' && e.properties.job_id === falJob.id);
  const falRes = events.find(e => e.event === 'media_generation_result' && e.properties.job_id === falJob.id);
  assert.equal(falSub?.properties.provider_kind, 'builtin');
  assert.equal(falSub?.properties.model_provider, 'fal');
  assert.equal(falSub?.properties.model_id, 'fal-ai/flux/schnell');
  assert.equal(falRes?.properties.provider_kind, 'builtin');
  assert.equal(falRes?.properties.model_provider, 'fal');
  assert.equal(falRes?.properties.model_id, 'fal-ai/flux/schnell');
  await falGateway.close();

  // 3) Failure path maps closed error_code without raw message leakage
  assert.equal(mediaGenerationError(Object.assign(new Error('secret key sk-123 failed'), { status: 401 })), 'AUTH_REJECTED');
  assert.equal(mediaGenerationError(Object.assign(new Error('quota'), { status: 402 })), 'BALANCE_LOW');
  assert.equal(mediaGenerationError(new Error('Generation timed out')), 'TIMEOUT');
  assert.equal(mediaGenerationError(new Error('anything'), 'interrupted'), 'WORKER_INTERRUPTED');
  assert.equal(mediaGenerationError(new Error('anything'), 'cancelled'), 'CANCELLED');

  // 3) Custom compatible provider omits model_provider and model_id
  const customProviderId = await gateway.connections.configure(null, {
    label: 'Private Endpoint',
    baseUrl: 'https://private.example.com/v1',
    apiKey: 'secret-token',
    protocol: 'openai',
    enabled: true,
  });
  await gateway.connections.saveModel(customProviderId, {
    modelId: 'internal/secret-model-v9',
    label: 'Secret Model',
    kind: 'image',
    enabled: true,
  });
  const failingGateway = new ModelGateway(store, {
    tracking,
    fetcher: async () => new Response('unauthorized', { status: 401 }),
    pollMs: 10,
  });
  const customJob = await failingGateway.submit({
    modality: 'image',
    prompt: 'Private render',
    model: `${customProviderId}:internal/secret-model-v9`,
    library: { title: 'Private' },
  });
  await failingGateway.tick();
  for (let i = 0; i < 40; i++) {
    const current = await failingGateway.getJob(customJob.id);
    if (current.state === 'completed' || current.state === 'failed') break;
    await new Promise(r => setTimeout(r, 20));
  }
  await tracking.flush();

  const customSub = events.find(e => e.event === 'media_generation_submitted' && e.properties.job_id === customJob.id);
  const customRes = events.find(e => e.event === 'media_generation_result' && e.properties.job_id === customJob.id);
  assert.equal(customSub.properties.provider_kind, 'custom');
  assert.equal(customSub.properties.model_provider, undefined);
  assert.equal(customSub.properties.model_id, undefined);
  assert.equal(customRes.properties.provider_kind, 'custom');
  assert.equal(customRes.properties.model_provider, undefined);
  assert.equal(customRes.properties.model_id, undefined);
  assert.equal(customRes.properties.job_state, 'failed');
  assert.equal(customRes.properties.error_code, 'AUTH_REJECTED');

  await gateway.close();
  await failingGateway.close();
  tracking.close();
}, false));

test('P0-B: Capability Center toolInputFields and toolResultFields extract capability_id, executor_kind, dry_run and fallback_raw_model safely', () => {
  assert.equal(safeCapabilityId('remove-background'), 'remove-background');
  assert.equal(safeCapabilityId('custom/unsafe path!'), 'other');
  assert.equal(safeCapabilityId(''), undefined);

  assert.deepEqual(
    toolInputFields('openmotion_capability_run', { capabilityId: 'relight', dryRun: true }),
    { action: 'run', capability_id: 'relight', dry_run: true },
  );
  assert.deepEqual(
    toolInputFields('openmotion_capability_run', { model: 'fal:flux-pro', dryRun: false }),
    { action: 'run', dry_run: false, fallback_raw_model: true },
  );
  assert.deepEqual(
    toolResultFields('openmotion_capability_run', { capabilityId: 'remove-background' }, { capabilityId: 'remove-background', executorKind: 'prompt-preset', dryRun: true }),
    { capability_id: 'remove-background', executor_kind: 'prompt-preset', dry_run: true, fallback_raw_model: false },
  );
  assert.deepEqual(
    toolResultFields('openmotion_capability_run', { model: 'fal:flux-pro' }, { executorKind: 'model' }),
    { executor_kind: 'model', fallback_raw_model: true },
  );
  assert.equal(
    validProperties(omEvents, 'mcp_tool_finished', {
      tool_name: 'motion_capability_run',
      call_id: crypto.randomUUID(),
      accepted: true,
      action: 'run',
      capability_id: 'remove-background',
      executor_kind: 'prompt-preset',
      dry_run: true,
      fallback_raw_model: false,
      outcome: 'success',
      duration_ms: 120,
    }),
    true,
  );
});

test('P0-C: work_generation_stage and project_create_result carry template_id attribution and host_context', () => fixture(async store => {
  const { tracking, events } = fakeTracker();
  const service = new Phase1Service(store, pluginRoot, {
    origin: () => 'http://127.0.0.1:4173',
    nativeUrl: () => undefined,
    openProject: async () => {},
    mutation: async task => task(),
    cancel: async () => {},
    tracking,
  });

  const created = await service.call('openmotion_create_project', {
    requestId: crypto.randomUUID(),
    projectType: 'template',
    templateId: 'decision-tree',
    title: 'Template Attributed Film',
    requirements: 'Demo',
  }, codexHost);

  const began = await service.call('openmotion_open_preview', {
    action: 'begin',
    projectId: created.projectId,
    requestId: crypto.randomUUID(),
    mode: 'create',
  }, codexHost);

  const film = `<!doctype html><html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>
body{margin:0}#main{position:relative;width:320px;height:180px;background:#14354a}
#title{color:white;font-size:28px}</style></head><body>
<div id="main" data-composition-id="main" data-start="0" data-duration="2" data-width="320" data-height="180" data-fps="24">
<div id="title" class="clip" data-start="0" data-duration="2" data-track-index="0">Attributed video</div></div><script>const tl=gsap.timeline({paused:true});tl.to('#title',{opacity:0.5,duration:2},0);window.__timelines={main:tl};</script></body></html>`;
  await writeFile(path.join(store.projectDirectoryFor(created.projectId), 'index.html'), film);
  const current = await service.call('openmotion_get_project', { projectId: created.projectId }, codexHost);
  await service.call('openmotion_open_preview', {
    action: 'complete_generation',
    projectId: created.projectId,
    workId: began.inlineWork.id,
    requestId: crypto.randomUUID(),
    expectedRevision: current.revision,
    expectedVersionId: current.currentVersionId,
  }, codexHost);
  await tracking.flush();

  const createEv = events.find(e => e.event === 'project_create_result');
  assert.equal(createEv?.properties.creation_route, 'template');
  assert.equal(createEv?.properties.template_id, 'decision-tree');
  assert.equal(createEv?.host_context?.host_agent, 'codex');

  const stageEvents = events.filter(e => e.event === 'work_generation_stage');
  assert.deepEqual(stageEvents.map(e => e.properties.stage), ['started', 'generated']);
  for (const ev of stageEvents) {
    assert.equal(ev.properties.template_id, 'decision-tree');
    assert.equal(ev.properties.attribution_source, 'project_catalog');
    assert.equal(ev.host_context?.host_agent, 'codex');
  }
  const hostStarted = events.find(e => e.event === 'host_run_started');
  assert.equal(hostStarted?.host_context?.host_agent, 'codex');
  tracking.close();
}, false));

test('P1-D: ScenarioRuns emits terminal scenario_run_result and scenario_step_result once without replay duplication', () => fixture(async store => {
  const { tracking, events } = fakeTracker();
  const runs = new ScenarioRuns(store.directory, store, tracking);

  const createReq = crypto.randomUUID();
  const { run } = await runs.create({ requestId: createReq, scenarioId: 'motion-full-chain' });
  // Idempotent replay must not duplicate scenario_run_result
  await runs.create({ requestId: createReq, scenarioId: 'motion-full-chain' });

  const firstStep = Object.keys(run.steps)[0]!;
  // Rejected mutations that throw after mutating status/archived must NOT emit success milestones
  await assert.rejects(
    runs.updateStep({
      runId: run.id,
      expectedRevision: run.revision,
      requestId: crypto.randomUUID(),
      stepId: firstStep,
      status: 'done',
      bindings: { reference: ['nonexistent-pool-item'] },
    }),
    /POOL_ITEM_NOT_FOUND|not found/i,
  );
  await assert.rejects(
    runs.updateRun({
      runId: run.id,
      expectedRevision: run.revision,
      requestId: crypto.randomUUID(),
      changes: { archived: true, activeStepId: 'nonexistent-step' },
    }),
    /Unknown step|not found/i,
  );

  const stepReq = crypto.randomUUID();
  const updated = await runs.updateStep({
    runId: run.id,
    expectedRevision: run.revision,
    requestId: stepReq,
    stepId: firstStep,
    status: 'done',
  });
  await runs.updateStep({
    runId: run.id,
    expectedRevision: run.revision,
    requestId: stepReq,
    stepId: firstStep,
    status: 'done',
  });

  await runs.updateRun({
    runId: run.id,
    expectedRevision: updated.run.revision,
    requestId: crypto.randomUUID(),
    changes: { archived: true },
  });
  await tracking.flush();

  const runEvents = events.filter(e => e.event === 'scenario_run_result');
  const stepEvents = events.filter(e => e.event === 'scenario_step_result');
  assert.deepEqual(runEvents.map(e => e.properties.action), ['create', 'archive']);
  assert.equal(runEvents[0].properties.scenario_id, 'motion-full-chain');
  assert.equal(runEvents[1].properties.completed_step_count, 1);

  assert.equal(stepEvents.length, 1);
  assert.equal(stepEvents[0].properties.scenario_id, 'motion-full-chain');
  assert.equal(stepEvents[0].properties.step_id, firstStep);
  assert.equal(stepEvents[0].properties.action, 'status_change');
  assert.equal(stepEvents[0].properties.step_status, 'done');
  tracking.close();
}, false));

test('P1-D: SuperAgentConversations emits super_agent_approval_result and super_agent_turn_result with safe error mapping', () => fixture(async store => {
  const { tracking, events } = fakeTracker();
  const service = new SuperAgentConversations(store, {
    tracking,
    resolveAgent: async () => null,
  });
  assert.equal(superAgentError(new Error('HTTP 401 unauthorized')), 'AUTH_ERROR');
  assert.equal(superAgentError(new Error('request timed out')), 'TIMEOUT');
  assert.equal(superAgentError(new Error('stopped'), true), 'ABORTED');

  assert.equal(
    validProperties(omEvents, 'super_agent_turn_result', {
      runtime_kind: 'local-direct',
      engine: 'codex',
      model_id: 'gpt-5.3-codex',
      permission_mode: 'on-request',
      intent: 'game',
      outcome: 'completed',
      duration_ms: 4200,
      tool_call_count: 5,
      approval_count: 1,
      artifact_count: 1,
      changed_file_count: 3,
      input_tokens: 12000,
      output_tokens: 2400,
    }),
    true,
  );
  assert.equal(
    validProperties(omEvents, 'super_agent_approval_result', {
      runtime_kind: 'local-bridge',
      approval_kind: 'generation',
      decision: 'approved',
      always_allow: false,
      wait_ms: 1850,
    }),
    true,
  );
  // Private/unregistered fields must be rejected
  assert.equal(
    validProperties(omEvents, 'super_agent_turn_result', {
      runtime_kind: 'local-direct',
      engine: 'codex',
      permission_mode: 'on-request',
      outcome: 'completed',
      duration_ms: 100,
      tool_call_count: 0,
      approval_count: 0,
      artifact_count: 0,
      prompt: 'secret prompt',
    }),
    false,
  );
  await service.close();
  tracking.close();
}, false));

test('P2-E: Codex LLM trace sampling is deterministic per device and always retains failed/error turns', () => {
  assert.equal(resolveCodexTraceSampleRate({ environment: {} }), 1);
  assert.equal(resolveCodexTraceSampleRate({ environment: { OPENMOTION_LLM_TRACE_SAMPLE_RATE: '0.2' } }), 0.2);
  assert.equal(resolveCodexTraceSampleRate({ environment: { OPENMOTION_LLM_TRACE_SAMPLE_RATE: 'invalid' } }), 1);
  assert.equal(resolveCodexTraceSampleRate({ sampleRate: -0.5 }), 0);
  assert.equal(resolveCodexTraceSampleRate({ sampleRate: 2.5 }), 1);

  // Error turns are always forced even at sampleRate=0
  assert.deepEqual(
    shouldSampleCodexTurn({ sampleKey: 'omd_device_1', sampleRate: 0, turnStatus: 'failed', hasToolFailure: false }),
    { include: true, reason: 'error_forced' },
  );
  assert.deepEqual(
    shouldSampleCodexTurn({ sampleKey: 'omd_device_1', sampleRate: 0, turnStatus: 'completed', hasToolFailure: true }),
    { include: true, reason: 'error_forced' },
  );

  // Deterministic distribution at 20% across 1000 devices
  let kept = 0;
  for (let i = 0; i < 1000; i++) {
    const first = shouldSampleCodexTurn({ sampleKey: `omd_dev_${i}`, sampleRate: 0.2, turnStatus: 'completed', hasToolFailure: false });
    const repeat = shouldSampleCodexTurn({ sampleKey: `omd_dev_${i}`, sampleRate: 0.2, turnStatus: 'completed', hasToolFailure: false });
    assert.deepEqual(first, repeat, 'sampling must be deterministic per device');
    if (first.include) kept += 1;
  }
  assert.ok(kept > 150 && kept < 250, `expected ~200 sampled devices at 20%, got ${kept}`);
});

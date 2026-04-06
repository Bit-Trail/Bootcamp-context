const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const ISO_DATETIME_WITH_TZ_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function createId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function parsePositiveInt(v, fieldName) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return n;
}

function parseNow(nowOverride) {
  if (nowOverride === undefined) {
    const d = new Date();
    return { nowMs: d.getTime(), nowIso: d.toISOString() };
  }
  if (typeof nowOverride !== 'string' || !ISO_DATETIME_WITH_TZ_REGEX.test(nowOverride)) {
    throw new Error('now must be a full ISO datetime string with timezone');
  }
  const d = new Date(nowOverride);
  if (Number.isNaN(d.getTime())) {
    throw new Error('now must be a valid ISO datetime');
  }
  return { nowMs: d.getTime(), nowIso: d.toISOString() };
}

function dedupePreserveOrder(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function toIsoOrNull(ms) {
  return ms === null ? null : new Date(ms).toISOString();
}

function deploymentSnapshot(d) {
  return {
    id: d.id,
    serviceId: d.serviceId,
    environment: d.environment,
    commitHash: d.commitHash,
    status: d.status,
    attempts: d.attempts,
    createdAt: new Date(d.createdAtMs).toISOString(),
    claimedAt: toIsoOrNull(d.claimedAtMs),
    completedAt: toIsoOrNull(d.completedAtMs),
    nextAttemptAt: toIsoOrNull(d.nextAttemptAtMs),
    lastError: d.lastError ?? null,
  };
}

class InMemoryStore {
  constructor() {
    this.services = []; // insertion order
    this.serviceById = new Map();

    this.deployments = []; // insertion order across all
    this.deploymentById = new Map();
    this.deploymentsByServiceId = new Map(); // serviceId -> deployment[]

    // For idempotency on POST /api/deployments:
    // (serviceId, environment, commitHash) -> deploymentId
    this.deploymentKeyToId = new Map();
  }

  createService({ name, repository, environments, maxAttempts, backoffSeconds }) {
    const id = createId();
    const service = {
      id,
      name,
      repository,
      environments,
      maxAttempts,
      backoffSeconds,
    };
    this.services.push(service);
    this.serviceById.set(id, service);
    this.deploymentsByServiceId.set(id, []);
    return service;
  }

  getService(id) {
    return this.serviceById.get(id) || null;
  }

  createDeployment({ service, serviceId, environment, commitHash, nowMs }) {
    const deploymentId = createId();
    const deployment = {
      id: deploymentId,
      serviceId,
      environment,
      commitHash,
      status: 'PENDING',
      attempts: 0,
      createdAtMs: nowMs,
      claimedAtMs: null,
      completedAtMs: null,
      nextAttemptAtMs: nowMs,
      lastError: null,
      history: [{ type: 'CREATED', atMs: nowMs, attempt: 0 }],
    };

    this.deployments.push(deployment);
    this.deploymentById.set(deploymentId, deployment);
    this.deploymentsByServiceId.get(serviceId).push(deployment);

    const key = this.deploymentKey(serviceId, environment, commitHash);
    this.deploymentKeyToId.set(key, deploymentId);
    return deployment;
  }

  deploymentKey(serviceId, environment, commitHash) {
    return `${serviceId}::${environment}::${commitHash}`;
  }

  findDeploymentByKey(serviceId, environment, commitHash) {
    const key = this.deploymentKey(serviceId, environment, commitHash);
    const id = this.deploymentKeyToId.get(key);
    if (!id) return null;
    return this.deploymentById.get(id) || null;
  }

  getDeployment(id) {
    return this.deploymentById.get(id) || null;
  }

  listServiceDeployments(serviceId) {
    return this.deploymentsByServiceId.get(serviceId) || [];
  }
}

const store = new InMemoryStore();

function requireService(req, res, next, serviceId) {
  const service = store.getService(serviceId);
  if (!service) {
    res.status(404).json({ error: 'Service not found' });
    return null;
  }
  return service;
}

function requireDeployment(req, res, next, deploymentId) {
  const deployment = store.getDeployment(deploymentId);
  if (!deployment) {
    res.status(404).json({ error: 'Deployment not found' });
    return null;
  }
  return deployment;
}

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/api/services', (req, res) => {
  try {
    const { name, repository, environments, maxAttempts, backoffSeconds } = req.body ?? {};

    if (!isNonEmptyString(name)) return res.status(400).json({ error: 'name must be non-empty string' });
    if (!isNonEmptyString(repository)) {
      return res.status(400).json({ error: 'repository must be non-empty string' });
    }
    if (!Array.isArray(environments) || environments.length === 0) {
      return res.status(400).json({ error: 'environments must be a non-empty array' });
    }
    if (!environments.every((e) => typeof e === 'string' && e.trim().length > 0)) {
      return res.status(400).json({ error: 'environments must be non-empty strings' });
    }

    const maxA = parsePositiveInt(maxAttempts, 'maxAttempts');
    const backoff = parsePositiveInt(backoffSeconds, 'backoffSeconds');

    const dedupedEnvs = dedupePreserveOrder(environments.map((e) => e.trim()));
    if (dedupedEnvs.length === 0) {
      return res.status(400).json({ error: 'environments must contain at least one unique non-empty value' });
    }

    const service = store.createService({
      name: name.trim(),
      repository: repository.trim(),
      environments: dedupedEnvs,
      maxAttempts: maxA,
      backoffSeconds: backoff,
    });

    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Bad Request' });
  }
});

app.get('/api/services', (req, res) => {
  res.status(200).json({ services: store.services });
});

function getNowFromBody(req) {
  const nowOverride = req.body?.now;
  const parsed = parseNow(nowOverride);
  return parsed;
}

app.post('/api/deployments', (req, res) => {
  try {
    const { serviceId, environment, commitHash } = req.body ?? {};

    if (!isNonEmptyString(commitHash)) {
      return res.status(400).json({ error: 'commitHash must be non-empty string' });
    }
    if (!isNonEmptyString(environment)) {
      return res.status(400).json({ error: 'environment must be non-empty string' });
    }
    if (!isNonEmptyString(serviceId)) {
      return res.status(400).json({ error: 'serviceId must be non-empty string' });
    }

    const service = requireService(req, res, null, serviceId);
    if (!service) return;

    const existing = store.findDeploymentByKey(serviceId, environment.trim(), commitHash.trim());
    if (existing) {
      return res.status(200).json(deploymentSnapshot(existing));
    }

    const envTrimmed = environment.trim();
    const commitTrimmed = commitHash.trim();

    if (!service.environments.includes(envTrimmed)) {
      return res.status(400).json({ error: 'environment must be in the service environments list' });
    }

    const idx = service.environments.indexOf(envTrimmed);
    if (idx > 0) {
      const prevEnv = service.environments[idx - 1];
      const hasPrevLive = store
        .listServiceDeployments(serviceId)
        .some(
          (d) =>
            d.status === 'LIVE' &&
            d.environment === prevEnv &&
            d.commitHash === commitTrimmed
        );
      if (!hasPrevLive) {
        return res.status(400).json({
          error: `Promotion rule failed: LIVE deployment required for previous environment '${prevEnv}' and commit`,
        });
      }
    }

    const { nowMs } = getNowFromBody(req);
    const deployment = store.createDeployment({
      service,
      serviceId,
      environment: envTrimmed,
      commitHash: commitTrimmed,
      nowMs,
    });

    res.status(201).json(deploymentSnapshot(deployment));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Bad Request' });
  }
});

app.post('/api/deployments/claim', (req, res) => {
  try {
    const { nowMs } = getNowFromBody(req);

    const due = store.deployments
      .filter((d) => d.status === 'PENDING' && d.nextAttemptAtMs !== null && d.nextAttemptAtMs <= nowMs)
      .sort((a, b) => {
        if (a.nextAttemptAtMs !== b.nextAttemptAtMs) return a.nextAttemptAtMs - b.nextAttemptAtMs;
        return a.createdAtMs - b.createdAtMs;
      });

    if (due.length === 0) {
      return res.status(204).send();
    }

    const deployment = due[0];
    deployment.status = 'DEPLOYING';
    deployment.attempts += 1;
    deployment.claimedAtMs = nowMs;
    deployment.history.push({ type: 'CLAIMED', atMs: nowMs, attempt: deployment.attempts });

    res.status(200).json({ deployment: deploymentSnapshot(deployment) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Bad Request' });
  }
});

app.post('/api/deployments/:id/complete', (req, res) => {
  try {
    const { id } = req.params;
    const deployment = requireDeployment(req, res, null, id);
    if (!deployment) return;
    if (deployment.status !== 'DEPLOYING') {
      return res.status(400).json({ error: 'Deployment must be in DEPLOYING status' });
    }

    const { nowMs } = getNowFromBody(req);
    deployment.status = 'LIVE';
    deployment.completedAtMs = nowMs;
    deployment.nextAttemptAtMs = null;

    deployment.history.push({ type: 'DEPLOYED', atMs: nowMs, attempt: deployment.attempts });

    // Supersede any previous LIVE deployment for the same (serviceId, environment)
    const toSupersede = store.deployments.filter(
      (d) =>
        d.serviceId === deployment.serviceId &&
        d.environment === deployment.environment &&
        d.status === 'LIVE' &&
        d.id !== deployment.id
    );
    for (const prev of toSupersede) {
      prev.status = 'SUPERSEDED';
      prev.history.push({ type: 'SUPERSEDED', atMs: nowMs, attempt: prev.attempts });
    }

    res.status(200).json(deploymentSnapshot(deployment));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Bad Request' });
  }
});

app.post('/api/deployments/:id/fail', (req, res) => {
  try {
    const { id } = req.params;
    const deployment = requireDeployment(req, res, null, id);
    if (!deployment) return;
    if (deployment.status !== 'DEPLOYING') {
      return res.status(400).json({ error: 'Deployment must be in DEPLOYING status' });
    }

    const { error: errorMsg } = req.body ?? {};
    if (!isNonEmptyString(errorMsg)) {
      return res.status(400).json({ error: 'error must be non-empty string' });
    }

    const service = store.getService(deployment.serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const { nowMs } = getNowFromBody(req);
    deployment.lastError = errorMsg;

    deployment.history.push({ type: 'FAILED', atMs: nowMs, attempt: deployment.attempts });

    if (deployment.attempts < service.maxAttempts) {
      deployment.status = 'PENDING';
      deployment.claimedAtMs = null;
      deployment.nextAttemptAtMs = nowMs + deployment.attempts * service.backoffSeconds * 1000;
    } else {
      deployment.status = 'DEAD';
      deployment.completedAtMs = nowMs;
      deployment.nextAttemptAtMs = null;
      deployment.history.push({ type: 'DEAD', atMs: nowMs, attempt: deployment.attempts });
    }

    res.status(200).json(deploymentSnapshot(deployment));
  } catch (err) {
    res.status(400).json({ error: err.message || 'Bad Request' });
  }
});

app.post('/api/deployments/:id/rollback', (req, res) => {
  try {
    const { id } = req.params;
    const deployment = requireDeployment(req, res, null, id);
    if (!deployment) return;
    if (deployment.status !== 'LIVE') {
      return res.status(400).json({ error: 'Deployment must be in LIVE status' });
    }

    const { nowMs } = getNowFromBody(req);

    const supersededCandidates = store.deployments
      .filter(
        (d) =>
          d.serviceId === deployment.serviceId &&
          d.environment === deployment.environment &&
          d.status === 'SUPERSEDED'
      )
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const revived = supersededCandidates[0] || null;
    if (!revived) {
      return res.status(400).json({ error: 'nothing to roll back to' });
    }

    deployment.status = 'ROLLED_BACK';
    deployment.history.push({ type: 'ROLLED_BACK', atMs: nowMs, attempt: deployment.attempts });

    revived.status = 'LIVE';
    revived.history.push({ type: 'REVIVED', atMs: nowMs, attempt: revived.attempts });

    res.status(200).json({ rolledBack: deploymentSnapshot(deployment), revived: deploymentSnapshot(revived) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Bad Request' });
  }
});

app.get('/api/deployments/:id', (req, res) => {
  const deployment = store.getDeployment(req.params.id);
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' });
  res.status(200).json(deploymentSnapshot(deployment));
});

app.get('/api/services/:id/deployments', (req, res) => {
  const service = store.getService(req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found' });

  const { environment, status } = req.query ?? {};
  let deployments = store.listServiceDeployments(service.id);
  if (environment !== undefined) deployments = deployments.filter((d) => d.environment === environment);
  if (status !== undefined) deployments = deployments.filter((d) => d.status === status);

  deployments = [...deployments].sort((a, b) => a.createdAtMs - b.createdAtMs);
  res.status(200).json({ deployments: deployments.map(deploymentSnapshot) });
});

app.get('/api/deployments/:id/history', (req, res) => {
  const deployment = store.getDeployment(req.params.id);
  if (!deployment) return res.status(404).json({ error: 'Deployment not found' });

  const history = [...deployment.history]
    .sort((a, b) => a.atMs - b.atMs)
    .map((h) => ({
      type: h.type,
      at: new Date(h.atMs).toISOString(),
      attempt: h.attempt,
    }));

  res.status(200).json({ history });
});

// Default 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
});


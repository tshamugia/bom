#!/usr/bin/env node
// Points Railway services at GHCR image tags and waits for each deployment.
//
//   RAILWAY_TOKEN=… node scripts/railway-deploy.mjs \
//     dxf-checker=ghcr.io/tshamugia/bom-dxf-checker:0.1.2 bom=ghcr.io/tshamugia/bom:0.1.2
//
// RAILWAY_TOKEN is a Railway *project* token: it already names the project and
// the environment (production), so only service names are passed. Services are
// deployed one after the other, in the order given, and the script stops at
// the first one that doesn't reach SUCCESS. Used by .github/workflows/deploy.yml.

const API = "https://backboard.railway.com/graphql/v2";
const TIMEOUT_MS = Number(process.env.DEPLOY_TIMEOUT_SECONDS ?? 900) * 1000;
const POLL_MS = 5000;
const DONE = new Set(["SUCCESS"]);
const FAILED = new Set(["FAILED", "CRASHED", "REMOVED", "SKIPPED"]);

const token = process.env.RAILWAY_TOKEN;
if (!token) fail("RAILWAY_TOKEN is not set: add a Railway project token for production as a repository secret.");

const targets = process.argv.slice(2).map((arg) => {
  const eq = arg.indexOf("=");
  if (eq < 1 || !arg.slice(eq + 1).includes(":")) fail(`Expected service=image:tag, got "${arg}"`);
  return { service: arg.slice(0, eq), image: arg.slice(eq + 1) };
});
if (targets.length === 0) fail("Nothing to deploy: pass service=image:tag pairs.");

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "project-access-token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) {
    throw new Error(`Railway API ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 500)}`);
  }
  return body.data;
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(deploymentId, service) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < TIMEOUT_MS) {
    const { deployment } = await gql(`query($id: String!) { deployment(id: $id) { status } }`, { id: deploymentId });
    const status = deployment?.status ?? "UNKNOWN";
    if (status !== last) {
      console.log(`  ${service}: ${status}`);
      last = status;
    }
    if (DONE.has(status)) return;
    if (FAILED.has(status)) fail(`${service}: deployment ${deploymentId} ended ${status}. Check its logs in Railway.`);
    await sleep(POLL_MS);
  }
  fail(`${service}: deployment ${deploymentId} still ${last} after ${TIMEOUT_MS / 1000}s.`);
}

const { projectToken } = await gql(`{ projectToken { projectId environmentId } }`);
const { projectId, environmentId } = projectToken;

const { project } = await gql(
  `query($id: String!) { project(id: $id) { name services { edges { node { id name } } } } }`,
  { id: projectId },
);
const byName = new Map(project.services.edges.map(({ node }) => [node.name, node.id]));

for (const { service, image } of targets) {
  const serviceId = byName.get(service);
  if (!serviceId) fail(`No service "${service}" in Railway project "${project.name}" (has: ${[...byName.keys()].join(", ")}).`);

  console.log(`${service} → ${image}`);
  await gql(
    `mutation($s: String!, $e: String!, $image: String!) {
      serviceInstanceUpdate(serviceId: $s, environmentId: $e, input: { source: { image: $image } })
    }`,
    { s: serviceId, e: environmentId, image },
  );
  const { serviceInstanceDeployV2: deploymentId } = await gql(
    `mutation($s: String!, $e: String!) { serviceInstanceDeployV2(serviceId: $s, environmentId: $e) }`,
    { s: serviceId, e: environmentId },
  );
  console.log(`  deployment ${deploymentId}`);
  await waitFor(deploymentId, service);
}

console.log("All services deployed.");

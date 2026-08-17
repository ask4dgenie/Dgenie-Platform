// DGENIE Development Control Centre — local status server.
// Zero dependencies (Node's built-in http/fs only), so `node server.js` just works.
//
// What this does: serves index.html, and re-reads manifest.json from disk on every
// request to /api/status, computing phase-level and overall rollups fresh each time.
// There is no caching and no build step — editing manifest.json and saving is the
// entire "update" mechanism. The dashboard polls /api/status every few seconds, so a
// saved edit shows up in the open browser tab within one poll interval, no restart,
// no reload needed.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4848;
const ROOT = __dirname;
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const INDEX_PATH = path.join(ROOT, 'index.html');

function statusWeight(status) {
  // Used only for the progress bar math below.
  return status === 'complete' ? 1 : 0;
}

function computeRollup(manifest) {
  const phases = manifest.phases.map((phase) => {
    const total = phase.tasks.length;
    const complete = phase.tasks.filter((t) => t.status === 'complete').length;
    const inProgress = phase.tasks.filter((t) => t.status === 'in-progress').length;
    const blocked = phase.tasks.filter((t) => t.status === 'blocked').length;
    let phaseStatus = 'not-started';
    if (complete === total && total > 0) phaseStatus = 'complete';
    else if (complete > 0 || inProgress > 0) phaseStatus = 'in-progress';
    else if (blocked === total && total > 0) phaseStatus = 'blocked';
    return {
      ...phase,
      status: phaseStatus,
      progress: total === 0 ? 0 : Math.round((complete / total) * 100),
      counts: { total, complete, inProgress, blocked, notStarted: total - complete - inProgress - blocked },
    };
  });

  const allTasks = manifest.phases.flatMap((p) => p.tasks);
  const totalTasks = allTasks.length;
  const completeTasks = allTasks.filter((t) => t.status === 'complete').length;

  return {
    generatedAt: new Date().toISOString(),
    lastMeaningfulUpdate: manifest.lastMeaningfulUpdate,
    sourceOfTruth: manifest.sourceOfTruth,
    overallProgress: totalTasks === 0 ? 0 : Math.round((completeTasks / totalTasks) * 100),
    totalTasks,
    completeTasks,
    phases,
    openBlockers: manifest.openBlockers || [],
  };
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/status') {
    fs.readFile(MANIFEST_PATH, 'utf8', (err, raw) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Could not read manifest.json', detail: String(err) }));
        return;
      }
      let manifest;
      try {
        manifest = JSON.parse(raw);
      } catch (parseErr) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'manifest.json is not valid JSON', detail: String(parseErr) }));
        return;
      }
      const body = JSON.stringify(computeRollup(manifest));
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    });
    return;
  }

  if (url === '/' || url === '/index.html') {
    fs.readFile(INDEX_PATH, 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Could not read index.html: ' + String(err));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`DGENIE Development Control Centre running at http://localhost:${PORT}`);
  console.log('Leave this running and open that URL in Chrome. Edit manifest.json to update status; the open tab picks it up automatically.');
});

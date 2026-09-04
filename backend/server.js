const express = require('express');
const cors = require('cors');
const projectsRouter = require('./src/projects');
const requirementsRouter = require('./src/requirements');
const attachmentsRouter = require('./src/attachments');
const testCasesRouter = require('./src/testCases');
const bugsRouter = require('./src/bugs');
const releasesRouter = require('./src/releases');
const testExecutionHistoryRouter = require('./src/testExecutionHistory');
const dailyReportRouter = require('./src/dailyReport');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/projects', projectsRouter);
app.use('/api/requirements', requirementsRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/bugs', bugsRouter);
app.use('/api/releases', releasesRouter);
app.use('/api/test-execution-history', testExecutionHistoryRouter);
app.use('/api/daily-report', dailyReportRouter);
app.use('/api/plan', require('./routes/planAnalysis'));

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  const lanIps = Object.values(nets)
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

  console.log(`QA Management API running on http://localhost:${PORT}`);
  lanIps.forEach((ip) => console.log(`  (LAN 접속용: http://${ip}:${PORT})`));
});

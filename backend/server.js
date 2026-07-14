const express = require('express');
const cors = require('cors');
const projectsRouter = require('./src/projects');
const requirementsRouter = require('./src/requirements');
const attachmentsRouter = require('./src/attachments');
const testCasesRouter = require('./src/testCases');
const bugsRouter = require('./src/bugs');
const releasesRouter = require('./src/releases');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/projects', projectsRouter);
app.use('/api/requirements', requirementsRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/test-cases', testCasesRouter);
app.use('/api/bugs', bugsRouter);
app.use('/api/releases', releasesRouter);

app.listen(PORT, () => {
  console.log(`QA Management API running on http://localhost:${PORT}`);
});

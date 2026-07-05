require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const whatsappService = require('./services/whatsappService');
const SchedulerService = require('./services/schedulerService');
const createDashboardRouter = require('./routes/dashboardRoutes');

const app = express();
const port = Number(process.env.PORT || 3000);
const lockFilePath = path.join(process.cwd(), '.schedulebot.lock');

function setupSingleInstanceLock() {
  let existingPid = null;

  try {
    const current = fs.readFileSync(lockFilePath, 'utf8').trim();
    existingPid = Number(current);
  } catch (error) {
    // Lock file does not exist yet.
  }

  if (existingPid && Number.isInteger(existingPid)) {
    try {
      process.kill(existingPid, 0);
      console.error(`[BOOT] Another instance is already running (PID ${existingPid}).`);
      process.exit(1);
    } catch (error) {
      // Stale lock, continue and overwrite.
    }
  }

  fs.writeFileSync(lockFilePath, String(process.pid));

  const cleanup = () => {
    try {
      const storedPid = Number(fs.readFileSync(lockFilePath, 'utf8').trim());
      if (storedPid === process.pid) {
        fs.rmSync(lockFilePath, { force: true });
      }
    } catch (error) {
      // Ignore cleanup errors.
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

setupSingleInstanceLock();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use('/', createDashboardRouter(whatsappService));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

whatsappService.init();

const scheduler = new SchedulerService(whatsappService);
scheduler.start();

app.listen(port, '0.0.0.0', () => {
  console.log(`[WEB] Dashboard running at http://localhost:${port}`);
});

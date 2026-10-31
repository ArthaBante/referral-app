import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes/api.ts';
import { db } from './server/db.ts';
import { AuthService } from './server/services/auth.ts';
import { BusinessService } from './server/services/business.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Initialize seed staff and sample customers
  await AuthService.initSeedData();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API router
  app.use('/api', apiRouter);

  // Scheduled job: Run daily job on startup and check every minute for 09:00 Europe/London time
  function checkAndRunDailyJob() {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const partMap: Record<string, string> = {};
      for (const p of parts) {
        partMap[p.type] = p.value;
      }
      const year = partMap['year'];
      const month = partMap['month'];
      const day = partMap['day'];
      const hour = parseInt(partMap['hour'] || '0', 10);
      const minute = parseInt(partMap['minute'] || '0', 10);

      const todayDateStr = `${year}-${month}-${day}`;
      const isAfterOrAt9 = hour > 9 || (hour === 9 && minute >= 0);

      if (isAfterOrAt9) {
        db.transaction((database) => {
          const lastRun = database.settings.last_daily_job_run_date;
          if (lastRun !== todayDateStr) {
            console.log(`[Schedule] Running 09:00 UK daily job for ${todayDateStr} (London time ${hour}:${minute})...`);
            BusinessService.runDailyJob(database);
            database.settings.last_daily_job_run_date = todayDateStr;
          }
        });
      }
    } catch (err) {
      console.error('[Schedule Error]', err);
    }
  }

  checkAndRunDailyJob();
  setInterval(checkAndRunDailyJob, 60000);

  // Vite integration
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

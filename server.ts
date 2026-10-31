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

  // Scheduled job: Run daily job on startup and schedule every hour check for 09:00 IST
  // 09:00 IST is 03:30 UTC
  setInterval(() => {
    try {
      const now = new Date();
      // UTC hours + 5.5 = IST
      const istMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + 330;
      const istHour = Math.floor((istMinutes % 1440) / 60);
      const istMin = (istMinutes % 1440) % 60;
      if (istHour === 9 && istMin === 0) {
        console.log('[Schedule] Triggering 09:00 IST daily job...');
        db.transaction((database) => {
          BusinessService.runDailyJob(database);
        });
      }
    } catch (err) {
      console.error('[Schedule Error]', err);
    }
  }, 60000);

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

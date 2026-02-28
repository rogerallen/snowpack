import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import snowRouter from './routes/snow.ts';
import logger from './lib/logger.ts';
import { initDb } from './lib/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Graceful environment loading
const envPath = path.join(__dirname, '..', '.env');
const envTestPath = path.join(__dirname, '..', '.env.test');

if (process.env.NODE_ENV === 'test' && fs.existsSync(envTestPath)) {
  // @ts-expect-error: loadEnvFile is a new Node.js 20+ feature
  process.loadEnvFile(envTestPath);
} else if (fs.existsSync(envPath)) {
  // @ts-expect-error: loadEnvFile is a new Node.js 20+ feature
  process.loadEnvFile(envPath);
}

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', snowRouter);

// In production, serve the static files from the 'dist' folder
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Initialize Database
initDb()
  .then(() => {
    if (process.env.NODE_ENV !== 'test') {
      app.listen(port, () => {
        logger.info({ port }, 'Server listening and database initialized');
      });
    }
  })
  .catch((err) => {
    logger.error({ err }, 'Failed to initialize database');
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  });

export default app;

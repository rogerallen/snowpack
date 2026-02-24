import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import snowRouter from './routes/snow.js';
import logger from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', snowRouter);

// In production, serve the static files from the 'dist' folder
if (process.env.NODE_ENV === 'production') {
  // server/index.js -> server -> root/dist
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));

  // The "catchall" handler: for any request that doesn't match one above,
  // send back React's index.html file.
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    logger.info({ port }, 'Server listening');
  });
}

export default app;

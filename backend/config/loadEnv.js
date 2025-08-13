// backend/config/loadEnv.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load backend/.env BEFORE anything else
dotenv.config({ path: path.join(__dirname, '..', '.env') });

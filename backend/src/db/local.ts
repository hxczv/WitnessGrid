import postgres from 'postgres';
import { config } from '../config.js';

export const dbLocal = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
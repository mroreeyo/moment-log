import { startServer } from './http/server.js';

startServer(Number(process.env.PORT ?? 8080));

// Custom Next.js server that integrates Socket.IO.
// Next.js API routes are serverless-style and cannot handle persistent WebSocket connections natively.
//
// How it works:
//  1. We create a standard Node.js http.Server
//  2. We pass it to Next.js via next().getRequestHandler()
//  3. We attach Socket.IO to the same server
//  4. We store the io instance on global.io so all API route handlers can
//     emit events without needing req.app.get('io')

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

// Load environment variables before Next.js starts
require('dotenv').config({ path: '.env.local' });

// Application configuration
const dev = process.env.NODE_ENV !== 'production';

// Network binding address:
// '0.0.0.0' binds to all network interfaces so the server accepts local, LAN, and cloud container traffic.
const bindAddress = '0.0.0.0';

// Next.js client-facing hostname:
// In development, Next.js must use 'localhost' so internal URLs, CLI logs, and browser launchers open http://localhost:PORT
// instead of 0.0.0.0 (which results in ERR_ADDRESS_INVALID in Chromium-based browsers).
const hostname = dev ? 'localhost' : (process.env.HOSTNAME || 'localhost');

// Render automatically provides PORT.
// Local development defaults to port 3000.
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Create HTTP server
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  // Attach Socket.IO to the same HTTP server
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    },
  });

  // Make Socket.IO globally accessible to API routes
  global.io = io;

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Join a specific queue room
    socket.on('join_queue', ({ queueId }) => {
      if (queueId) {
        socket.join(queueId.toString());
      }
    });

    // Leave a specific queue room
    socket.on('leave_queue', ({ queueId }) => {
      if (queueId) {
        socket.leave(queueId.toString());
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id);
    });
  });

  // Start HTTP server listening on 0.0.0.0 so it supports external connections
  httpServer.listen(port, bindAddress, () => {
    const localUrl = `http://${hostname}:${port}`;
    console.log(`QFlow server running on ${localUrl} (listening on ${bindAddress}:${port})`);
    console.log('Next.js and Socket.IO are running successfully.');
  });
}).catch((err) => {
  console.error('Failed to start QFlow server:', err);
  process.exit(1);
});
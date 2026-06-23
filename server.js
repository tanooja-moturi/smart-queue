// Custom Next.js server that integrates Socket.IO.
// This is required because Next.js API routes are serverless-style and cannot
// handle persistent WebSocket connections natively.
//
// How it works:
//  1. We create a standard Node.js http.Server
//  2. We pass it to Next.js via next().getRequestHandler()
//  3. We attach Socket.IO to the same server
//  4. We store the io instance on `global.io` so all API route handlers can
//     emit events without needing req.app.get('io') (Express pattern)

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');


// Load env vars (Next.js loads .env.local automatically for app code, but we
// need dotenv here for the server bootstrap before Next.js starts)
require('dotenv').config({ path: '.env.local' });

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Validate required env vars early
if (!process.env.JWT_SECRET) {
  console.error('CRITICAL ERROR: JWT_SECRET environment variable is missing.');
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
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

  // Make io globally accessible for API route handlers
  global.io = io;

  // Socket.IO event handling
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join a specific queue room
    socket.on('join_queue', ({ queueId }) => {
      if (queueId) {
        socket.join(queueId.toString());
        console.log(`Socket ${socket.id} joined room queueId: ${queueId}`);
      }
    });

    // Leave a specific queue room
    socket.on('leave_queue', ({ queueId }) => {
      if (queueId) {
        socket.leave(queueId.toString());
        console.log(`Socket ${socket.id} left room queueId: ${queueId}`);
      }
    });

    // ... other custom socket handlers if needed

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  // Seed default staff user in Supabase
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('CRITICAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined.');
    } else {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey);

      const { data: staff, error: fetchError } = await supabaseAdminInstance
        .from('users')
        .select('id')
        .eq('role', 'staff')
        .limit(1);

      if (fetchError) {
        console.error('Error querying users in Supabase:', fetchError.message);
      } else if (!staff || staff.length === 0) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        const { error: seedError } = await supabaseAdminInstance
          .from('users')
          .insert({
            name: 'Default Staff',
            email: 'staff@queue.com',
            password: hashedPassword,
            role: 'staff',
          });

        if (seedError) {
          console.error('Error seeding default staff user in Supabase:', seedError.message);
        } else {
          console.log('Seeded default staff user in Supabase: staff@queue.com / password123');
        }
      } else {
        console.log('Default staff user check complete: user exists in Supabase');
      }
    }
  } catch (error) {
    console.error('Error seeding default user:', error.message);
  }


  httpServer.listen(port, () => {
    console.log(`> QFlow ready on http://${hostname}:${port}`);
  });
});

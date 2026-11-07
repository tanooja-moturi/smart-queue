# QFlow – Smart Queue Management System

![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?logo=firebase)
![Firestore](https://img.shields.io/badge/Cloud_Firestore-FFA611?logo=firebase)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css)

QFlow is a **full-stack, real-time virtual queue management system** that eliminates physical waiting lines through digital queue management. Customers can join queues using a QR code or a unique URL, receive a digital token, and track their queue status in real time. Staff members manage queues through a secure dashboard with live updates powered by Socket.IO and cloud-based data storage using Google Cloud Firestore and Firebase Authentication.

---

# 🚀 Features

## 👤 Customer Features

- Join a queue without creating an account
- Receive a unique digital token instantly (atomic generation prevents duplicates)
- Track queue position and estimated wait time in real time
- Real-time updates without refreshing via Socket.IO
- Text-to-Speech (TTS) audio announcements when your token is called
- Mobile-friendly interface and QR-code join support

---

## 👨‍💼 Staff Features

- Firebase Authentication (Email / Password with secure ID tokens)
- Role-based server authorization (staff/admin protected endpoints)
- Create and manage multiple queues with unique alphanumeric codes
- Dynamic QR code generation for on-site scanning
- Real-time live queue statistics (waiting, served, active)
- Call the next customer with instant audio broadcast
- Mark customers as **Served** or **Skipped**
- Real-time staff dashboard updates via Socket.IO

---

# 🛠 Tech Stack

## Frontend & Full-Stack Framework
- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- Lucide React & QRCode.react
- Socket.IO Client

## Backend & Real-Time
- Custom Node.js HTTP Server (`server.js`)
- Socket.IO Server (integrated with Next.js)
- Firebase Admin SDK (server-side ID token verification & Firestore transactions)

## Cloud Database & Auth
- **Firebase Authentication**: User identity and session management
- **Cloud Firestore**: High-performance NoSQL database (Spark free-tier compatible)

---

# 🏗 Database Schema (Cloud Firestore)

```text
/users/{uid}
  ├── name: string
  ├── email: string
  ├── role: 'customer' | 'staff' | 'admin'
  └── createdAt: timestamp

/queues/{queueId}
  ├── queueName: string
  ├── queueCode: string (e.g., "BANK-A1B2")
  ├── averageServiceTime: number
  ├── tokenPrefix: string (e.g., "A")
  ├── lastTokenNumber: number (atomic counter)
  ├── userId: string (owner staff UID)
  ├── createdAt: timestamp
  │
  └── entries/{entryId}
        ├── customerName: string
        ├── queueId: string
        ├── token: string (e.g., "A001")
        ├── status: 'waiting' | 'called' | 'served' | 'skipped'
        ├── joinedAt: ISO timestamp
        ├── calledAt: ISO timestamp | null
        └── servedAt: ISO timestamp | null
```

---

# 👨‍💼 Provisioning the First Staff Account

Self-registered users in QFlow are always assigned the `customer` role for security.

To provision or promote a staff account securely:

```bash
# 1. Promote an already registered user to staff:
node scripts/set-staff.js staff@example.com

# 2. Or create a brand new staff user directly:
node scripts/set-staff.js staff@example.com MySecurePassword123 "Main Office Staff"
```

---

# 📦 Installation & Running Locally

1. Install dependencies:
```bash
npm install
```

2. Start the development server (runs custom Next.js + Socket.IO server):
```bash
npm run dev
```

3. Open in your browser:
```text
http://localhost:3000
```

4. Build for production:
```bash
npm run build
```

---

# 📡 API Endpoints

## Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register customer account (enforces role: customer) |
| POST | `/api/auth/login` | Login and obtain session / verify token |
| GET | `/api/auth/me` | Fetch authenticated user profile & role |

## Queues (Staff Protected)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/queues` | Create a new queue (Staff only) |
| GET | `/api/queues` | List staff member's queues with live stats (Staff only) |
| DELETE | `/api/queues/:id` | Cascade delete queue and entries (Staff only) |
| GET | `/api/queues/public/:code` | Public queue lookup by alphanumeric code |

## Queue Entries
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/entries/join/:code` | Public: Join queue with atomic token increment |
| GET | `/api/entries/track/:token` | Public: Track token position and wait time |
| GET | `/api/entries/queue/:queueId` | Staff: Retrieve entries for a queue |
| POST | `/api/entries/queue/:queueId/call-next` | Staff: Call next customer in line |
| PATCH | `/api/entries/:id/status` | Staff: Update customer status (served/skipped) |

---

# 🔒 Security Rules

Firestore rules are defined in `firestore.rules`. Deploy rules to Firebase via Firebase CLI:
```bash
firebase deploy --only firestore:rules
```

---

# 👩‍💻 Author

**Moturi Venkata Satya Tanooja Sree**
GitHub: https://github.com/tanooja-moturi/smart-queue

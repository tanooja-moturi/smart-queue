# QFlow – Smart Queue Management System

![React](https://img.shields.io/badge/React-20232A?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js)
![Express.js](https://img.shields.io/badge/Express.js-000000?logo=express)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio)
![Railway](https://img.shields.io/badge/Deployed%20on-Railway-0B0D0E)

QFlow is a **full-stack, real-time virtual queue management system** that eliminates physical waiting lines through digital queue management. Customers can join queues using a QR code or a unique URL, receive a digital token, and track their queue status in real time. Staff members manage queues through a secure dashboard with live updates powered by Socket.IO and cloud-based data storage using Supabase.

---

# 🌐 Live Demo

**Application:**  
https://smart-queue-production.up.railway.app/

---

# 🚀 Features

## 👤 Customer Features

- Join a queue without creating an account
- Receive a unique digital token instantly
- Track queue position in real time
- View estimated waiting time
- Receive browser notifications when the token is called
- Text-to-Speech (TTS) announcements for called tokens
- Mobile-friendly interface

---

## 👨‍💼 Staff Features

- Secure JWT Authentication
- Create and manage multiple queues
- Generate unique queue links
- Generate QR Codes for each queue
- View live queue statistics
- Call the next customer
- Mark customers as **Served** or **Skipped**
- Real-time dashboard updates using Socket.IO

---

# 🛠 Tech Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Socket.IO Client
- Lucide React

---

## Backend

- Node.js
- Express.js
- TypeScript
- Socket.IO
- JWT Authentication
- bcryptjs

---

## Database

- Supabase (PostgreSQL)

---

## Deployment

- Railway
- Supabase

---

# 🔧 Technologies Used

- React
- TypeScript
- Node.js
- Express.js
- Socket.IO
- Supabase
- JWT Authentication
- Tailwind CSS
- Vite
- Railway

---

# 📂 Project Structure

```text
QFlow
│
├── backend
│   ├── src
│   ├── controllers
│   ├── middleware
│   ├── routes
│   ├── services
│   ├── utils
│   └── server.ts
│
├── frontend
│   ├── src
│   ├── components
│   ├── hooks
│   ├── pages
│   ├── assets
│   └── App.tsx
│
└── README.md
```

---

# 🔄 System Workflow

1. Staff logs into the dashboard.
2. Staff creates a queue.
3. A Queue Code and QR Code are generated.
4. Customers scan the QR code or open the queue link.
5. Customers receive a digital token.
6. Staff calls the next customer.
7. Socket.IO broadcasts updates instantly.
8. Customers receive browser notifications and voice announcements.
9. Staff marks customers as **Served** or **Skipped**.

---

# 🏗 System Architecture

```text
                Customer
                     │
                     ▼
      React + TypeScript Frontend
                     │
          REST API + Socket.IO
                     │
                     ▼
      Node.js + Express.js Backend
                     │
                     ▼
        Supabase (PostgreSQL Database)
```

---

# ⚙️ Environment Variables

## Backend (.env)

```env
PORT=5000

SUPABASE_URL=your_supabase_project_url

SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

JWT_SECRET=your_secret_key

FRONTEND_URL=http://localhost:5173

API_URL=http://localhost:5000
```

---

## Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:5000/api

VITE_SOCKET_URL=http://localhost:5000
```

---

# 📦 Installation

Clone the repository

```bash
git clone https://github.com/tanooja-moturi/smart-queue.git
```

Move into the project directory

```bash
cd smart-queue
```

Install dependencies

```bash
npm install
```

Create environment files

```text
backend/.env

frontend/.env
```

Configure the environment variables with your own Supabase credentials.

Start the development server

```bash
npm run dev
```

---

# ▶ Running the Application Locally

Frontend

```text
http://localhost:5173
```

Backend

```text
http://localhost:5000
```

---

# 📡 API Endpoints

## Authentication

| Method | Endpoint |
|---------|----------|
| POST | `/api/auth/register` |
| POST | `/api/auth/login` |
| GET | `/api/auth/me` |

---

## Queues

| Method | Endpoint |
|---------|----------|
| POST | `/api/queues` |
| GET | `/api/queues` |
| GET | `/api/queues/public/:code` |

---

## Queue Entries

| Method | Endpoint |
|---------|----------|
| POST | `/api/entries/join/:code` |
| GET | `/api/entries/track/:token` |
| GET | `/api/entries/queue/:queueId` |
| PATCH | `/api/entries/:id/status` |
| POST | `/api/entries/queue/:queueId/call-next` |

---

# 🌍 Deployment

| Service | Platform |
|----------|----------|
| Frontend | Railway |
| Backend | Railway |
| Database | Supabase (PostgreSQL) |

---

# 📸 Screenshots

> Screenshots and demo GIFs will be added soon.

Suggested screenshots:

- Login Page
- Dashboard
- Queue Creation
- QR Code
- Customer Queue Page
- Live Queue Tracking
- Mobile View

---

# 🎯 Future Enhancements

- SMS Notifications
- Email Notifications
- Multi-Branch Queue Management
- Analytics Dashboard
- Mobile Application
- Admin Panel
- Queue History Reports
- AI-Based Waiting Time Prediction

---

# 👩‍💻 Author

**Moturi Venkata Satya Tanooja Sree**

B.Tech – Computer Science and Engineering

Vignan Institute of Information Technology

GitHub  
https://github.com/tanooja-moturi/smart-queue

LinkedIn  
https://www.linkedin.com/in/tanooja-moturi-427346318

---

# 📄 License

This project is developed for educational, research, and portfolio purposes.
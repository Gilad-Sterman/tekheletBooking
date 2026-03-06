# Ptil Tekhelet - Tour Management Platform

A modern, full-stack application designed to streamline tour scheduling, guide assignments, and synchronization with Google Calendar. Built for **Ptil Tekhelet**, this platform provides coordinates and guides with a unified view of their schedules.

## 🚀 Features

### 1. Management Dashboard
- **Monthly/Weekly/Daily Views**: Unified calendar interface using FullCalendar.
- **Current View**: Defaults to **Month view** for a strategic overview.
- **Upcoming Tours Sidebar**: A quick-access sidebar showing the next 10 tours, filtered by role.

### 2. Multi-User Sync
- **Google Calendar Integration**: Real-time synchronization of tours to personal Google Calendars.
- **OAuth2 Flow**: Secure, one-click linking and disconnecting of calendars.
- **Smart Conflict Detection**: Prevents double-booking of guides or time slots.

### 3. Role-Based Access (RBAC)
- **Coordinators**: Full administrative control — create, edit, and delete tours across all guides.
- **Guides**: Dedicated view of their own upcoming assignments and personal sync status.

### 4. Professional Branding
- Custom branded interface with the Tekhelet Tours logo and favicon.
- Refined SCSS styling architecture for maintainability and performance.

### 5. Automated "Catch-up" Sync
- Background processes ensure that even if the server is offline or sync is missed, the database and Google Calendar are eventually reconciled.

## 🛠 Tech Stack

- **Frontend**: React, Vite, SCSS, FullCalendar, Lucide-React.
- **Backend**: Node.js, Express, MongoDB (Mongoose).
- **Authentication**: JWT-based auth with secure password hashing.
- **APIs**: Google Calendar API (OAuth2).

## 📦 Installation & Setup

### Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas)
- Google Cloud Console Project (for OAuth2)

### 1. Clone & Install
```bash
git clone https://github.com/Gilad-Sterman/tekheletBooking.git
cd server
npm install
```

### 2. Environment Variables
Create a `.env` file in the `server` directory:
```env
PORT=3030
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret
GOOGLE_REDIRECT_URI=http://localhost:3030/api/auth/google/callback
```

### 3. Seed Database (Optional)
```bash
node seed.js
```

### 4. Run the Application
The frontend is already built into the `server/public` directory. Simply run:
```bash
npm run start # Or npm run dev for nodemon
```
Access the app at `http://localhost:3030`.

## 🎨 Development & Refactoring

The frontend styles have been fully refactored into a modular SCSS architecture located in `client/src/assets/styles`. This allows for theme consistency and easy visual updates.

---
*Created with 💙 for Ptil Tekhelet*

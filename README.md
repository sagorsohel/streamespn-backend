# StreamESPN Backend API

Modern Express.js REST API with **Drizzle ORM**, **MySQL**, and **JWT Authentication**.

## 🚀 Features

- **Express.js** modular architecture
- **Drizzle ORM** with `mysql2` driver
- **JWT (JSON Web Token)** authentication & authorization middlewares
- **Password Hashing** with `bcryptjs`
- **Security Middlewares** (`helmet`, `cors`)
- **Logging** (`morgan`)
- **Drizzle Kit CLI** for DB migrations & schema management

---

## 📁 Project Structure

```
streamespn-backend/
├── .env.example
├── .env
├── package.json
├── drizzle.config.js         # Drizzle Kit configuration
└── src/
    ├── server.js             # HTTP server entrypoint
    ├── app.js                # Express app initialization
    ├── db/
    │   ├── index.js          # Drizzle ORM DB pool connection
    │   └── schema.js         # Drizzle ORM MySQL tables schema
    ├── middleware/
    │   ├── auth.js           # JWT verification & role middlewares
    │   └── error.js          # Error handling middlewares
    ├── controllers/
    │   ├── authController.js # Signup, Login, Profile handlers
    │   └── userController.js # User listing & details handlers
    └── routes/
        ├── authRoutes.js     # /api/auth endpoints
        ├── userRoutes.js     # /api/users endpoints
        └── index.js          # API route aggregator
```

---

## 🛠️ Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your MySQL database credentials:

```env
PORT=5000
NODE_ENV=development

# MySQL DB Settings
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=streamespn_db
DB_PORT=3306

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d
```

### 3. Push Database Schema (Drizzle Kit)
Make sure your MySQL server is running and the database specified in `DB_NAME` exists. Then push the schema:

```bash
npm run db:push
```

You can also launch Drizzle Studio UI to visualize your database:
```bash
npm run db:studio
```

### 4. Start the Development Server
```bash
npm run dev
```

---

## 📡 API Endpoints Summary

### Health Check
- `GET /health` - Server health status

### Authentication Routes (`/api/auth`)
- `POST /api/auth/register` - Register a new user
  - **Body:** `{ "name": "John Doe", "email": "john@example.com", "password": "password123" }`
- `POST /api/auth/login` - User login & receive JWT token
  - **Body:** `{ "email": "john@example.com", "password": "password123" }`
- `GET /api/auth/me` - Get current authenticated user profile
  - **Header:** `Authorization: Bearer <your_jwt_token>`

### User Routes (`/api/users`)
- `GET /api/users` - Get all users (Protected)
  - **Header:** `Authorization: Bearer <your_jwt_token>`
- `GET /api/users/:id` - Get user by ID (Protected)
  - **Header:** `Authorization: Bearer <your_jwt_token>`

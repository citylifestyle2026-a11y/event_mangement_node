# Event Management CRM — Backend

Initial backend project setup only. No authentication or business modules yet.

## Tech Stack
- Node.js
- Express.js
- MongoDB + Mongoose
- JWT (dependency installed, not wired up yet)
- CommonJS module system

## Folder Structure
```
event-management-backend/
├── config/
│   └── db.js                    # MongoDB connection
├── controllers/
│   └── auth.controller.js       # login, getProfile
├── middlewares/
│   ├── auth.middleware.js       # JWT verification (protect)
│   └── validate.middleware.js   # express-validator result handler
├── models/
│   └── User.js                  # User schema, password hashing, comparePassword
├── routes/
│   ├── health.routes.js         # GET /api/health
│   └── auth.routes.js           # POST /api/auth/login, GET /api/auth/profile
├── scripts/
│   └── seedAdmin.js             # dev-only script to create a test user
├── utils/
│   ├── AppError.js              # operational error class
│   ├── asyncHandler.js          # wraps async controllers/middleware
│   └── generateToken.js         # JWT signing
├── validators/
│   └── auth.validator.js        # express-validator rules for login
├── app.js                       # Express app configuration
├── server.js                    # App entry point, connects DB then starts server
├── package.json
├── .env                         # local environment variables (not committed)
└── .env.example                 # template for required environment variables
```

## Setup

1. Install dependencies
   ```
   npm install
   ```

2. Copy the example env file and fill in real values
   ```
   cp .env.example .env
   ```

3. Start MongoDB locally, or point `MONGO_URI` at your Atlas/remote cluster.

4. Create a test user (no register endpoint exists yet, so this is the only way in)
   ```
   npm run seed:admin
   ```
   Uses `SEED_ADMIN_NAME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env` if set, otherwise falls back to `admin@example.com` / `Admin@123`.

5. Run in development (auto-restarts on file changes)
   ```
   npm run dev
   ```

   Or run normally:
   ```
   npm start
   ```

## Health Check

```
GET /api/health
```

Response:
```json
{
  "success": true,
  "message": "Server Running Successfully"
}
```

## Authentication

### POST /api/auth/login
Body:
```json
{
  "email": "admin@example.com",
  "password": "Admin@123"
}
```
Success response (200):
```json
{
  "success": true,
  "message": "Login successful",
  "token": "<jwt>",
  "user": { "id": "...", "name": "...", "email": "...", "role": "admin" }
}
```
Validation errors return `422`. Wrong credentials return `401`.

### GET /api/auth/profile
Requires header: `Authorization: Bearer <token>`

Success response (200):
```json
{
  "success": true,
  "message": "Profile fetched successfully",
  "user": { "id": "...", "name": "...", "email": "...", "role": "...", "isActive": true, "createdAt": "..." }
}
```
Missing/invalid/expired token returns `401`.

Only these two auth endpoints exist so far — no register, no user management, no event APIs yet.


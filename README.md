# Quizite 🧠

A full-stack quiz creation and taking platform built with **Node.js**, **Express**, and **MongoDB**. Users can create multi-type quizzes, share them via unique links or 8-character codes, and get instant graded results.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Data Models](#data-models)
- [API Reference](#api-reference)
- [Frontend Pages](#frontend-pages)
- [Security](#security)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)

---

## Features

- 🔐 **Authentication** — JWT-based signup, login, logout, and cookie session management
- 🔑 **Password Reset** — Secure token-based password reset flow via email (SMTP)
- 🧾 **Profile Page** — View account details and stats, change password (re-issues session)
- 📝 **Quiz Creation** — Build quizzes with three question types:
  - **Multiple Choice** (2–6 choices, a correct choice is required)
  - **True / False** (correct answer required)
  - **Written Answer** (optional accepted-answer list for auto-grading; empty = collected but not graded)
- ✏️ **Quiz Editing** — Owners can load any quiz back into the builder and update it (`PATCH`)
- 🗑 **Quiz Deletion** — Owners can delete quizzes from the dashboard with a confirmation step
- 📄 **Multi-page Quizzes** — The builder keeps every question on one continuous page and groups them into pages of 10; takers move between pages with Previous / Next (max 8 pages / 80 questions)
- 🌐 **Quiz Sharing** — Every quiz gets a unique shareable URL and an 8-character code (e.g. `A7K9P2XZ`) with a share dialog that copies either one
- 🔎 **Join by Code** — "Enter Quiz Code" on the dashboard looks up a published quiz by its code and opens the existing taking page; guests are sent to login first and returned to the quiz afterward. Draft codes resolve only for their owner
- ✅ **Instant Grading** — Submit answers and land on a dedicated, refresh-safe results page with percentage score and per-question breakdown
- 🛡 **Retake Control** — Per-quiz `allowRetakes` setting enforces a single submission when disabled
- 👁 **Answer Reveal Control** — Per-quiz `showCorrectAnswers` setting decides whether takers see the answer key
- ❤️ **Likes** — Logged-in users can like / unlike quizzes (idempotent, atomic) from the quiz page and dashboard cards; counts stay in sync and rapid clicks are guarded. Quiz creators can click their quizzes' like counts wherever those quizzes appear — dashboard owned, liked, and taken lists, the quiz page, and public profiles — to see who liked them
- 🌐 **Public Creator Profiles** — `/users/:username` shows public stats and the creator's top three published quizzes, ranked by likes, unique participants, and title; draft details never leak
- 👤 **Owner Dashboard** — Paginated overview of owned quizzes plus "Liked quizzes" and "Quizzes you have taken" sections
- 📚 **Taken History** — Track completed quizzes with attempt counts and last score
- ❤️ **Liked Quizzes** — Dedicated, paginated sidebar view of every quiz the current user has liked, with an empty state and count badge
- 🌙 **Dark / Light Theme** — Persisted via `localStorage` with OS preference detection
- 💾 **Draft Persistence** — Quiz creation state is auto-saved to `localStorage` before server submission
- 🔒 **Draft Privacy** — Draft quizzes are only accessible to their owner (and admins for viewing)

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Runtime    | Node.js (ESM modules)                           |
| Web Server | Express 4                                       |
| Database   | MongoDB via Mongoose 5                          |
| Auth       | JSON Web Tokens (`jsonwebtoken`) + bcryptjs     |
| Email      | Nodemailer (SMTP)                               |
| Security   | Helmet, express-rate-limit, hpp, xss-clean, express-mongo-sanitize |
| Frontend   | Vanilla HTML/CSS/JavaScript (no framework)      |
| Testing    | Vitest + Supertest + mongodb-memory-server      |
| Dev Tools  | nodemon, ESLint (Airbnb), Prettier              |

> **Note on Mongoose 5:** The connection options in `server.js`
> (`useNewUrlParser`, `useCreateIndex`, `useFindAndModify`) are the recommended
> flags for the Mongoose 5.x line and are intentionally kept until a major
> version upgrade.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│  overview.html  login.html  signup.html  create.html │
│  quiz.html                                          │
│  (Vanilla JS, fetch API, cookie-based auth)         │
└────────────────────┬────────────────────────────────┘
                     │  HTTP / REST
┌────────────────────▼────────────────────────────────┐
│                  Express App  (app.js)               │
│                                                     │
│  Static Files (/css, /js) from frontend/            │
│  Page Routes  /, /login, /signup, /create,          │
│               /profile, /users/:username, /quiz/:id,│
│               /quiz/:id/edit                        │
│                                                     │
│  API Routes:                                        │
│  /api/auth      → authRoute.js                      │
│  /api/overview  → overviewRoute.js                  │
│  /api/users     → userRoute.js                      │
│  /api/quizzes   → quizRoute.js                      │
│                                                     │
│  Middleware Stack:                                  │
│  Helmet → Static → Rate Limit → Body Parser →       │
│  Cookie Parser → Mongo Sanitize → XSS → HPP →       │
│  Morgan → Compression → Routes → Error Handler      │
└────────────────────┬────────────────────────────────┘
                     │  Mongoose ODM
┌────────────────────▼────────────────────────────────┐
│                   MongoDB Atlas                      │
│  Collections: users, quizzes (unique shareCode),    │
│               quizattempts                          │
└─────────────────────────────────────────────────────┘
```

### Request Flow

1. Browser loads an HTML page from an Express page route; `/css` and `/js` serve the static frontend assets
2. The page JS calls the REST API using `fetch()` with `credentials: "include"`
3. Express middleware validates the JWT from the `jwt` cookie
4. The controller performs the business logic against MongoDB
5. A JSON response is returned and the page re-renders accordingly

---

## Project Structure

```
quizite/
├── server.js                  # Entry point: DB connection + server start
├── app.js                     # Express app: middleware + route mounting
├── dirname.js                 # ESM __dirname shim
├── config.env                 # Runtime environment variables (not committed)
├── config.env.example         # Template for config.env
│
├── model/
│   ├── userModel.js           # Mongoose User schema
│   ├── quizModel.js           # Mongoose Quiz schema (nested pages/questions)
│   └── quizAttemptModel.js    # Immutable record of each quiz submission
│
├── controllers/
│   ├── authController.js      # signup, login, logout, resetPassword, updatePassword, protect, optionalAuth
│   ├── quizController.js      # createQuiz, getQuiz, getQuizByShareCode, updateQuiz, deleteQuiz, submitQuiz, likeQuiz, unlikeQuiz
│   ├── userController.js      # getMe, getCompletedQuizzes, getLikedQuizzes, changePassword
│   ├── overviewController.js  # getOverview — paginated owned quizzes + liked count
│   └── errorController.js     # Global error handler with mapped DB/JWT errors
│
├── routes/
│   ├── authRoute.js           # POST /api/auth/signup|login|reset-password|update-password, GET /logout
│   ├── quizRoute.js           # CRUD /api/quizzes + submit + like/unlike
│   ├── userRoute.js           # GET/PATCH /api/users/me + completed + liked lists
│   └── overviewRoute.js       # GET /api/overview
│
├── utils/
│   ├── appError.js            # Operational error class
│   ├── catchAsync.js          # Async error wrapper for controllers
│   ├── quizValidation.js      # Strict parsing/validation of quiz payloads
│   ├── quizCode.js            # Secure 8-char share-code generation, validation, retry save, backfill helper
│   ├── participantStats.js    # Unique quiz participant aggregation helpers
│   └── email.js               # Nodemailer SMTP helper
│
├── tests/
│   ├── setup.js               # Vitest env setup (in-memory MongoDB)
│   ├── helpers/               # db bootstrap, factories, agent helpers
│   ├── auth.test.js           # Auth endpoint and protected-page redirect tests
│   ├── authUi.test.js         # Login `next` redirect handling tests
│   ├── quizApi.test.js        # Quiz CRUD/submit/like/users API tests, including share-code lookup and access rules
│   ├── quizCode.test.js       # Share-code generation, uniqueness, collision retry, and backfill tests
│   ├── quizModel.test.js      # Schema validation tests
│   ├── quizUi.test.js         # Quiz loading, likes visibility, unanswered warnings, submission, results tests
│   ├── createUi.test.js       # Quiz-builder validation and alert tests
│   ├── overviewUi.test.js     # Dashboard actions, likes visibility, participant stats, and modal tests
│   ├── socialApi.test.js      # Owner-only liker lists, profile ranking/filtering, and unique participant tests
│   ├── publicProfileUi.test.js # Public profile top-three rendering, creator modal, and error-state tests
│   └── frontendServing.test.js # Relocated page shells, asset references, static serving, and legacy URL redirects
│
└── frontend/
    ├── pages/
    │   ├── overview.html            # Dashboard: owned + liked + taken quizzes, pagination, likes, sharing, join-by-code
    │   ├── login.html               # Login form
    │   ├── signup.html              # Signup form (shares auth JS/CSS with login)
    │   ├── profile.html             # Private profile info + password change
    │   ├── public-profile.html      # Public creator profile: likes received + top three quizzes
    │   ├── create.html              # Quiz builder UI (create + edit mode)
    │   ├── quiz.html                # Quiz taking UI
    │   └── results.html             # Dedicated quiz results page
    ├── css/
    │   ├── design-system.css        # Global tokens, primitives, and shared components
    │   ├── shared/
    │   │   ├── auth.css             # Auth/profile topbar and form styles
    │   │   ├── overview.css         # App shell and dashboard styles reused by create/quiz/results
    │   │   ├── profile.css          # Profile cards shared by private and public profiles
    │   │   └── quiz.css             # Quiz and results presentation styles
    │   ├── pages/
    │   │   ├── create.css           # Quiz builder-only styles
    │   │   ├── public-profile.css   # Public profile-only styles
    │   │   └── results.css          # Results page-only styles
    │   └── components/
    │       └── likes.css            # Shared creator-only likers modal styles
    └── js/
        ├── pages/
        │   ├── auth.js              # Login/signup controller
        │   ├── overview.js          # Dashboard controller
        │   ├── create.js            # Quiz builder controller
        │   ├── quiz.js              # Quiz-taking controller
        │   ├── results.js           # Results page controller
        │   ├── profile.js           # Private profile controller
        │   └── public-profile.js    # Public profile controller
        ├── components/
        │   └── likesModal.js        # Shared creator-only likers modal controller
        └── services/
            └── quizResultStore.js   # Per-tab short-lived results handoff
```

Page HTML lives under `frontend/pages/`; Express still serves the canonical
URLs (`/`, `/login`, `/signup`, `/profile`, `/users/:username`, `/create`,
`/quiz/:id`, `/quiz/:id/edit`, and `/quiz/:id/results`) from those files.
Stylesheets and scripts are mounted at `/css` and `/js`; the old root-level
`.html` page URLs redirect permanently to their canonical paths. Uploaded
quiz icons remain on the separate `/uploads` route.

---

## Data Models

### User

| Field                  | Type       | Notes                                    |
|------------------------|------------|------------------------------------------|
| `username`             | String     | Unique, 3–30 chars, alphanumeric + `_`   |
| `email`                | String     | Unique, lowercase, validated             |
| `passwordHash`         | String     | bcrypt hash, never returned in queries   |
| `passwordChangedAt`    | Date       | Used to invalidate old JWTs             |
| `ownedQuizzes`         | ObjectId[] | Denormalized refs to Quiz                |
| `completedQuizzes`     | ObjectId[] | Quizzes the user has submitted           |
| `role`                 | String     | `"user"` or `"admin"` (default: `"user"`)|
| `isActive`             | Boolean    | Soft-delete flag (default: `true`)       |
| `passwordResetTokenHash` | String   | SHA-256 hash of the reset token          |
| `passwordResetExpiresAt` | Date     | Expiry for the reset token (10 minutes)  |

### Quiz

| Field            | Type       | Notes                                           |
|------------------|------------|-------------------------------------------------|
| `title`          | String     | Required, max 150 chars                         |
| `description`    | String     | Optional, max 1000 chars                        |
| `owner`          | ObjectId   | Ref to User, indexed                            |
| `status`         | String     | `"draft"` or `"published"`                      |
| `pages`          | Page[]     | Nested array (max 8 pages / 80 questions total) |
| `likes`          | ObjectId[] | Users who liked the quiz (unique refs)          |
| `likeCount`      | Number     | Denormalized like count                         |
| `peopleTookCount`| Number     | Cached counter for unique logged-in takers; displayed counts are derived from completed `QuizAttempt`s |
| `allowRetakes`   | Boolean    | When `false`, each user may submit once         |
| `showCorrectAnswers` | Boolean | When `true`, takers see the answer key after submitting |
| `publishedAt`    | Date       | Set when status first changes to `"published"`  |
| `shareCode`      | String     | Auto-generated, immutable 8-char `A–Z0–9` join code; unique partial index |

#### Page

| Field       | Type         | Notes                          |
|-------------|--------------|--------------------------------|
| `title`     | String       | Optional, max 200 chars        |
| `questions` | Question[]   | Max 10 per page (validated)    |

A quiz may contain at most 8 pages and 80 questions in total. Both limits are
validated when a quiz is created or updated.

#### Question

| Field             | Type       | Notes                                                  |
|-------------------|------------|--------------------------------------------------------|
| `type`            | String     | `"multipleChoice"`, `"trueFalse"`, `"writtenAnswer"`   |
| `title`           | String     | The question text, max 2000 chars                      |
| `choices`         | Choice[]   | MCQ: 2–6; TF: always `[True, False]`; Written: none   |
| `correctChoiceId` | ObjectId   | Required for MCQ/TF; hidden from takers (`select: false`) |
| `acceptedAnswers` | String[]   | Written answers that grade as correct (max 20, `select: false`) |
| `correctText`     | String     | Legacy field, used as grading fallback (`select: false`) |
| `required`        | Boolean    | Default `true`                                         |

### QuizAttempt

An immutable record created for every authenticated submission (retakes create
additional attempts). Quiz loading and submission both require login.

| Field             | Type       | Notes                                        |
|-------------------|------------|----------------------------------------------|
| `quiz`            | ObjectId   | Ref to Quiz, indexed                        |
| `user`            | ObjectId   | Ref to User, indexed                        |
| `answers`         | Array      | `{ questionId, choiceId, writtenText }`     |
| `score`           | Number     | Correct graded answers                      |
| `totalQuestions`  | Number     | Total questions in the quiz                 |
| `gradedQuestions` | Number     | Questions with a gradeable answer key       |
| `percentage`      | Number     | `score / gradedQuestions`, rounded          |
| `completedAt`     | Date       | Indexed for history queries                 |

---

## API Reference

All API endpoints are prefixed with `/api`.

### Auth — `/api/auth`

| Method | Path               | Auth     | Description                              |
|--------|--------------------|----------|------------------------------------------|
| POST   | `/signup`          | Public   | Create a new account, returns JWT cookie |
| POST   | `/login`           | Public   | Login with username + password           |
| GET    | `/logout`          | Public   | Clears JWT and user cookies              |
| POST   | `/reset-password`  | Public   | Sends password-reset email               |
| POST   | `/update-password` | Public   | Resets password using a valid token      |

> All auth write endpoints are rate-limited to **10 requests / 15 minutes** per IP.

**Signup body:**
```json
{ "username": "alice", "email": "alice@example.com", "password": "secret123" }
```

**Login body:**
```json
{ "username": "alice", "password": "secret123" }
```

**Reset password body:**
```json
{ "email": "alice@example.com" }
```

**Update password body:**
```json
{ "token": "<reset-token>", "password": "newSecret456" }
```

---

### Overview — `/api/overview`

| Method | Path | Auth     | Description                          |
|--------|------|----------|--------------------------------------|
| GET    | `/`  | Required | Returns user info, paginated owned quizzes (with like/retake state), and `likedQuizCount` |

**Query parameters:** `page` (default `1`), `limit` (default `20`, max `50`).

**Response:**
```json
{
  "status": "success",
  "data": {
    "user": { "id": "...", "username": "alice" },
    "quizzes": [
      {
        "id": "...",
        "title": "My Quiz",
        "description": "",
        "questionCount": 5,
        "status": "published",
        "likeCount": 3,
        "likedByMe": true,
        "allowRetakes": false,
        "completedByMe": true,
        "peopleTookCount": 4,
        "updatedAt": "...",
        "shareUrl": "/quiz/...",
        "shareCode": "A7K9P2XZ"
      }
    ],
    "likedQuizCount": 7
  },
  "meta": {
    "total": 23,
    "page": 1,
    "limit": 20,
    "totalPages": 2,
    "hasPrevPage": false,
    "hasNextPage": true
  }
}
```

---

### Users — `/api/users`

| Method | Path         | Auth     | Description                                  |
|--------|--------------|----------|----------------------------------------------|
| GET    | `/me`        | Required | Profile info (username, email, role) + stats |
| GET    | `/me/completed` | Required | Quizzes the user has taken, with attempt stats |
| GET    | `/me/liked`  | Required | Paginated quizzes liked by the current user |
| PATCH  | `/me/password`  | Required | Change password (verifies current, re-issues session) |
| GET    | `/:username/profile` | Public | Public creator profile with total likes received and top three published quizzes |

**Change password body:**
```json
{ "currentPassword": "secret123", "newPassword": "newSecret456" }
```

**Completed quizzes response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "quizzes": [
      {
        "id": "...",
        "title": "My Quiz",
        "status": "published",
        "questionCount": 5,
        "likeCount": 3,
        "likedByMe": true,
        "allowRetakes": false,
        "completedByMe": true,
        "attempts": 2,
        "lastPercentage": 80,
        "lastCompletedAt": "..."
      }
    ]
  }
}
```

**Liked quizzes — query parameters:** `page` (default `1`), `limit` (default
`20`, max `50`). Only published quizzes and drafts owned by the viewer are
returned; an admin's existing draft access is preserved. Deleted quizzes
disappear automatically because likes are stored on the quiz document.

```json
{
  "status": "success",
  "results": 1,
  "data": {
    "quizzes": [
      {
        "id": "...",
        "title": "My Quiz",
        "description": "",
        "status": "published",
        "questionCount": 5,
        "likeCount": 3,
        "likedByMe": true,
        "allowRetakes": false,
        "completedByMe": true,
        "owner": { "id": "...", "username": "alice" },
        "updatedAt": "...",
        "shareUrl": "/quiz/..."
      }
    ]
  },
  "meta": {
    "total": 7,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasPrevPage": false,
    "hasNextPage": false
  }
}
```

---

### Public profiles — `/api/users/:username/profile`

Returns only public data. Usernames must be 3–30 letters, numbers, or
underscores; invalid or unknown usernames return `404`.

**Response:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "...",
      "username": "alice",
      "memberSince": "2025-01-15T12:00:00.000Z"
    },
    "stats": { "totalLikesReceived": 13 },
    "topLikedQuizzes": [
      {
        "id": "...",
        "title": "My best quiz",
        "icon": { "type": "emoji", "value": "🚀", "reference": "emoji:🚀" },
        "likeCount": 7,
        "peopleTookCount": 12,
        "shareUrl": "/quiz/...",
        "owner": { "id": "...", "username": "alice" }
      }
    ]
  }
}
```

- `totalLikesReceived` is the unique like total across all quizzes owned by the
  creator, including drafts. Likes are deduplicated per user.
- `topLikedQuizzes` contains at most **three published** quizzes owned by the
  creator. Quizzes are ordered by like count descending, then unique
  participants descending, then title using a case-insensitive comparison
  (with quiz ID as a final stable tie-break). Published quizzes with zero likes
  are still eligible; drafts are excluded entirely, so their titles and stats
  never leak.
- Email addresses, password hashes, reset tokens, roles, and activity flags are
  never returned. Quiz owner objects expose only `id` and `username`.

---

### Quizzes — `/api/quizzes`

| Method | Path              | Auth      | Description                                       |
|--------|-------------------|-----------|---------------------------------------------------|
| POST   | `/`               | Required  | Create a new quiz                                 |
| GET    | `/code/:code`     | Optional  | Look up a quiz by its 8-character share code      |
| GET    | `/:id`            | Required  | Get a quiz (draft only accessible to owner/admin) |
| PATCH  | `/:id`            | Required  | Update quiz title, description, pages, settings, or status (owner only) |
| DELETE | `/:id`            | Required  | Delete a quiz (owner only)                        |
| POST   | `/:id/submit`     | Required  | Submit answers and receive graded results         |
| POST   | `/:id/like`       | Required  | Like a quiz (idempotent)                          |
| DELETE | `/:id/like`       | Required  | Unlike a quiz (idempotent)                        |
| GET    | `/:id/likes`      | Required  | Owner-only list of users who liked the quiz        |

`GET /:id` and `POST /:id/submit` require authentication; anonymous requests
receive `401`. `GET /:id` additionally returns `isOwner`, `likedByMe`, and
`canRetake` so the client can render the correct state. Owners receive the
answer key (`correctChoiceId` / `acceptedAnswers`) when loading their own quiz
for editing. Quiz pages are protected too: anonymous visitors are redirected to
`/login?next=<destination>`, and the login form returns them to that destination
after a successful sign-in. The share-code lookup endpoint remains public and
returns only `{ id, shareUrl }`, so entering a code as a guest resolves the quiz
and then hands off to the login flow.

**Share codes.** Every quiz is assigned a cryptographically random, unique
8-character code (`A–Z`, `0–9`) on creation; it is never derived from the
document `_id` and never regenerated when the quiz is opened, edited, or
shared. Codes are declared in the schema, protected from client input, and
enforced unique by a database partial unique index. On server startup, any
legacy quizzes missing a code are backfilled in place without changing their
IDs, ownership, settings, or attempt history. `GET /code/:code` normalizes
lowercase input and returns only `{ id, shareUrl }` — never the quiz title or
any private data. Lookup follows the existing access rules: a missing or
invalid code returns `404` / `400`, and a draft's code returns `403` unless
the requester is the owner or an admin. Looking up a code never creates an
attempt or changes completion state.

`POST /:id/like` and `DELETE /:id/like` are idempotent and return
`{ likeCount, liked }`. Only published quizzes can be liked. The `likes` array
stores unique user references and is the source of truth; `likeCount` is
denormalized and repaired if a legacy document has drifted.

`GET /:id/likes` is **owner-only** and returns public liker identities in a
stable, case-insensitive username order:

```json
{
  "status": "success",
  "data": {
    "quiz": { "id": "...", "title": "My Quiz" },
    "likeCount": 2,
    "likers": [
      { "id": "...", "username": "alice", "profileUrl": "/users/alice" },
      { "id": "...", "username": "bob", "profileUrl": "/users/bob" }
    ]
  }
}
```

Non-owners receive `403`; anonymous requests receive `401`. The response never
includes liker emails, password data, tokens, or private account flags.

#### Create / Update Quiz Body

```json
{
  "title": "My Quiz",
  "description": "Optional description",
  "status": "published",
  "allowRetakes": false,
  "showCorrectAnswers": false,
  "questions": [
    {
      "type": "multipleChoice",
      "title": "What is 2+2?",
      "choices": [{ "text": "3" }, { "text": "4" }, { "text": "5" }],
      "correctChoiceIndex": 1
    },
    {
      "type": "trueFalse",
      "title": "The sky is blue.",
      "correctAnswer": "True"
    },
    {
      "type": "writtenAnswer",
      "title": "Name a programming language.",
      "acceptedAnswers": ["JavaScript", "JS"]
    }
  ]
}
```

> - A `correctChoiceIndex` / `correctAnswer` is **required** for multiple choice
>   and true/false questions.
> - `acceptedAnswers` is optional for written questions; when empty the question
>   is collected but excluded from the percentage denominator
>   (`gradedQuestions`).
> - A flat `questions` array is automatically grouped into pages of up to 10
>   questions, with a maximum of 8 pages and 80 questions per quiz.
> - Alternatively send a `pages` array to control page boundaries directly;
>   each page still accepts at most 10 questions. Existing question and choice
>   `_id`s may be included so they are preserved when editing (the builder sends
>   them on `PATCH`).
> - The creator builder never paginates its question list: all questions remain
>   visible and editable on one continuous screen, grouped by page. Only the
>   quiz-taking page uses Previous / Next navigation.
> - `shareCode` is server-generated and cannot be supplied or changed by
>   clients; it is rejected as a protected field like `owner` or `likes`.

#### Submit Answers Body

```json
{
  "answers": [
    { "questionId": "<id>", "choiceId": "<choice-id>" },
    { "questionId": "<id>", "writtenText": "JavaScript" }
  ]
}
```

#### Submit Response

```json
{
  "status": "success",
  "data": {
    "score": 2,
    "totalQuestions": 3,
    "gradedQuestions": 3,
    "percentage": 67,
    "peopleTookCount": 5,
    "countedForParticipants": true,
    "results": [
      {
        "questionId": "...",
        "title": "What is 2+2?",
        "type": "multipleChoice",
        "graded": true,
        "isCorrect": true,
        "userAnswer": "4",
        "correctAnswer": "4"
      },
      {
        "questionId": "...",
        "title": "Name a programming language.",
        "type": "writtenAnswer",
        "graded": false,
        "isCorrect": false,
        "userAnswer": "Python"
      }
    ]
  }
}
```

> - Written answers without `acceptedAnswers` return `"graded": false` and are
>   excluded from `gradedQuestions` / `percentage`.
> - The frontend keeps this response in per-tab `sessionStorage` for one hour
>   and navigates to `/quiz/:id/results`. Submission data is never placed in
>   the URL, and `localStorage` is not used for results.
> - `correctAnswer` and `acceptedAnswers` are only included when the quiz has
>   `showCorrectAnswers: true`.
> - When retakes are disabled and the user already submitted, the endpoint
>   responds `400`. Anonymous submissions are rejected with `401` before any
>   attempt is recorded or `peopleTookCount` changes.

---

## Frontend Pages

| URL              | File              | Description                                              | Auth Required |
|------------------|-------------------|----------------------------------------------------------|---------------|
| `/`              | `pages/overview.html` | Dashboard — owned, liked, and taken quizzes (paginated)  | No (guest view)|
| `/login`         | `pages/login.html` | Login form                                               | No            |
| `/signup`        | `pages/signup.html` | Signup form                                              | No            |
| `/profile`       | `pages/profile.html` | Private profile info + stats and password change form     | Yes (redirects to `/login`) |
| `/users/:username` | `pages/public-profile.html` | Public creator profile: likes received and top three published quizzes | No (public) |
| `/create`        | `pages/create.html` | Quiz builder with question type tabs and live preview    | Yes (redirects to `/login`) |
| `/quiz/:id`      | `pages/quiz.html` | Take a quiz; successful submissions navigate to results  | Yes (redirects to `/login?next=...`) |
| `/quiz/:id/results` | `pages/results.html` | Dedicated scored results and per-question review        | No (public; per-tab result data) |
| `/quiz/:id/edit` | `pages/create.html` | Same builder in edit mode, pre-loaded with the quiz      | Yes (redirects to `/login`) |

### Notable Frontend Behaviours

- **Route Protection & Gating** — Protected pages (`/create`, `/profile`, `/quiz/:id`, `/quiz/:id/edit`) are guarded on the server via `protectPage` middleware. Unauthenticated visits redirect to `/login?next=<destination>`, and a successful login returns the user to that destination (unsafe or looping `next` values fall back to `/`). The dashboard still shows a guest view, but starting, taking, or creating a quiz requires login.
- **Session Cookie Architecture** — Authentication tokens are preserved via cookie (`jwt` with `Path=/`, 30-day lifetime) and mirrored in client storage. The overview page synchronously reads session state on startup and immediately transitions to authenticated mode upon login without desynchronization.
- **Dashboard likes** — Published quiz cards show a heart button and a separate like count. The heart is filled when liked and outlined otherwise; likes update optimistically, guard against rapid repeat clicks, and roll back with an error toast if the request fails. On cards the current user owns, the count is a button that opens the creator-only likers dialog; for everyone else it is plain, non-clickable text. Guests attempting to like are sent to `/login`.
- **Liked quizzes** — The sidebar "Liked quizzes" item loads `GET /api/users/me/liked` with pagination, loading/error states, and an empty state. Its badge uses `likedQuizCount` from the overview response (and the liked endpoint's `meta.total` once loaded), so no extra count request is required.
- **Dashboard take actions** — All dashboard sections use the stored `allowRetakes` setting and the current user's completion state: uncompleted quizzes show "Take quiz", completed quizzes with retakes show "Take again", and completed no-retake quizzes show no take action. Direct quiz links still show the explanation when retakes are disabled.
- **Delete confirmation** — Deleting an owned quiz opens a themed, accessible modal with the quiz title and a permanent-deletion warning. Cancel, backdrop, and Escape dismiss the dialog; confirmation shows a loading state, prevents duplicate requests, keeps errors inline for retry, and shows the existing success toast after the card is removed.
- **Share dialog** — The owner card action opens a themed modal showing the quiz link and its 8-character code (monospace). Each has its own copy button with inline "Copied!" feedback and a toast; the link is built from the current deployment origin, so redirects and custom domains keep working.
- **Join by code** — The sidebar and guest view expose "Enter Quiz Code". The modal accepts exactly 8 letters/numbers, auto-uppercases input, strips other characters, keeps submit disabled until complete, and supports Enter. While looking up it disables the form and shows a loading state; known codes navigate to the existing `/quiz/:id` route, invalid/unknown codes show a friendly inline message, and draft codes show the standard draft-privacy error. No attempt is created by looking up a code. Guests who resolve a code are redirected to login with the quiz destination preserved.
- **Creator likes list** — Wherever the current user owns a quiz with a visible like count — dashboard owned, liked, and taken sections, the quiz page, and a public profile's top quizzes — the count is a button. Clicking it opens the shared themed, accessible modal with loading, empty, error, and retry states; the owner sees liker usernames linked to their public profiles. Non-creators see ordinary text with no pointer or hover affordance. Identities are only fetched through the owner-only endpoint and are never embedded in public quiz responses.
- **Public profiles** — Every creator has a public `/users/:username` page showing their total unique likes received and their top three published quizzes, each with its icon, title, like count, and unique participant count. The ranking is deterministic and draft details are excluded; no email or account-private data is exposed. When the signed-in viewer is the creator, the quiz like counts open the shared likers modal; for everyone else they are plain text, and the backend still enforces ownership.
- **Unique participants** — Creator cards and quiz pages show one playful stat: distinct authenticated users who completed at least one attempt. Repeated attempts, retakes, revisiting results, and re-submitting do not inflate it. Because all submissions require login, anonymous traffic cannot create attempts or affect the count.
- **Theme** — Dark/light mode toggle persisted in `localStorage`; defaults to OS preference
- **Guest preview** — Append `?demo=1` to the overview URL to see a populated demo state
- **Draft saving** — The quiz builder auto-saves to `localStorage` on every input change (create mode only; edit mode always loads from the server)
- **Builder validation** — Publishing, saving, and adding questions validate all relevant fields at once. A themed `role="alert"` summary links to each invalid field, fields receive inline messages and `aria-invalid`, and errors clear automatically as the draft is corrected. Entered values are never discarded.
- **Unanswered-question warning** — Submitting checks every question across all pages. If any multiple-choice, true/false, or written question is unanswered, a themed modal lists the displayed question numbers and offers "Review unanswered questions" (navigates to the first one and marks all unanswered cards) or "Submit anyway" (submits once with blank answers). Answers are preserved on review and failed submissions.
- **Builder vs. taking pagination** — The creator builder shows every question in one continuous list, automatically grouped into page sections of 10 with page ranges (max 8 pages / 80 questions). Quiz takers see one page at a time and use Previous / Next; only the last page shows the submit button.
- **Quiz loading state** — The initial spinner is tied only to the quiz `GET` request. Success reveals the quiz and failure reveals an error card; submission uses a separate "Submitting answers…" button state and never reuses the page loader.
- **Dedicated results page** — After a successful submission, the server response is stored under a per-tab `sessionStorage` key with a one-hour TTL, then the browser navigates to `/quiz/:id/results`. No result data or answer keys are placed in the URL. Refreshing works in the same tab; missing or expired data shows a clear error instead of stale results.
- **Answer security** — Answer keys are excluded from `GET /api/quizzes/:id` for takers; they are sent to owners for editing and included in submit results only when `showCorrectAnswers` is enabled. The results page additionally refuses to render reveal fields when that setting was not enabled.

---

## Security

| Measure                    | Implementation                                      |
|----------------------------|-----------------------------------------------------|
| Password hashing           | bcrypt with cost factor 12                          |
| JWT signing                | HS256, 30-day expiry, cookie-based with `Path=/`    |
| Page-level route protection| `protectPage` server middleware redirects unauthenticated visits to `/create`, `/profile`, `/quiz/:id`, and `/quiz/:id/edit` to `/login?next=<destination>` |
| Secure cookies             | `secure: true` in production, `sameSite: "lax"`, `path: "/"` |
| Rate limiting (global)     | 100 requests / hour per IP on `/api`                |
| Rate limiting (auth)       | 10 requests / 15 minutes per IP on auth endpoints   |
| NoSQL injection protection | `express-mongo-sanitize`                            |
| XSS protection             | `xss-clean` on request body                         |
| HTTP headers               | `helmet` with an explicit CSP (`default-src 'self'`, Google Fonts allowed; `upgrade-insecure-requests` in production only) |
| Parameter pollution        | `hpp`                                               |
| Strict input validation    | `utils/quizValidation.js` rejects malformed payloads and protected fields |
| Share code integrity       | `crypto.randomInt`, DB-level unique partial index, collision retries on create and backfill; codes are never exposed to non-owners |
| Password change detection  | JWT `iat` checked against `passwordChangedAt`       |
| Reset tokens               | SHA-256 hashed before storage, 10-minute expiry     |
| Soft delete                | `isActive` flag prevents login without data removal |
| Atomic counters            | Likes / unique takers updated with atomic operators |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A MongoDB instance (local or [MongoDB Atlas](https://cloud.mongodb.com))
- (Optional) An SMTP server for password-reset emails

### Installation

```bash
git clone https://github.com/your-username/quizite.git
cd quizite
npm install
```

### Configuration

```bash
cp config.env.example config.env
# Edit config.env and fill in your values
```

### Run in Development

```bash
npm start
# Server starts on the PORT defined in config.env (default: 8000)
# Visit http://localhost:8000
```

On startup the server ensures the unique share-code index and backfills any
legacy quiz that is missing a code (logging the number of updated quizzes).
The backfill only writes `shareCode`, preserving IDs, ownership, permissions,
retake settings, and attempt history. It is safe to run repeatedly.

### Run in Production

```bash
npm run start:prod
```

---

## Environment Variables

| Variable             | Required | Description                                          |
|----------------------|----------|------------------------------------------------------|
| `DATABASELINK`       | ✅        | MongoDB connection string                            |
| `PORT`               | ✅        | Port the API server listens on                       |
| `JWT_SECRET`         | ✅        | Long random string used to sign JWTs                 |
| `EMAIL_HOST`         | ⚠️ Optional | SMTP server host (required for password reset)    |
| `EMAIL_PORT`         | ⚠️ Optional | SMTP port (e.g. `587` for TLS, `465` for SSL)    |
| `EMAIL_USERNAME`     | ⚠️ Optional | SMTP login username                               |
| `EMAIL_PASSWORD`     | ⚠️ Optional | SMTP login password                               |
| `EMAIL_FROM`         | ⚠️ Optional | `From` address shown in reset emails              |
| `PASSWORD_RESET_URL` | ⚠️ Optional | Base URL of your reset page; token appended as `?token=` |
| `WEB_PORT`           | ❌ Dev only | Port for `npm run start:frontend` (default: 4173) |

> If email variables are missing, the `/api/auth/reset-password` endpoint returns `503` gracefully.

---

## Scripts

| Script              | Description                                         |
|---------------------|-----------------------------------------------------|
| `npm start`         | Start server in development mode (nodemon)          |
| `npm run start:prod`| Start server in production mode                     |
| `npm run start:frontend` | Start frontend-only dev server                 |
| `npm run debug`     | Start with ndb debugger                             |
| `npm test`          | Run the full test suite once (Vitest)               |
| `npm run test:watch`| Run tests in watch mode                             |

### Testing

The suite currently contains **197 tests across 11 files**, covering auth,
quiz CRUD/submission/likes, share-code generation and lookup, schema
validation, owner-only liker lists, public profile ranking and privacy, unique
participants, relocated frontend serving and asset references, the quiz-taking
UI, the builder, and the dashboard (including sharing and join-by-code flows).

Tests run against an in-memory MongoDB provided by `mongodb-memory-server`
(no running database required). If your environment needs a specific `mongod`
binary, set `MONGOMS_SYSTEM_BINARY=/path/to/mongod`. Rate limiters are
automatically skipped when `NODE_ENV=test`.

---

## Author

**Ahmed Essam**

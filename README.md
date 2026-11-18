# Madhyamik AI Mitra (মাধ্যমিক এআই মিত্র)

> **Autonomous WBBSE Class 10 Exam Research Assistant, Blackboard Teacher & Live Voice Viva Prep**

[![WBBSE Class 10](https://img.shields.io/badge/WBBSE-Class%2010%20Madhyamik-143326?style=flat-square)](https://wbbse.wb.gov.in/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-4.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Gemini API](https://img.shields.io/badge/Google%20Gen%20AI-Gemini%20API-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![Firebase Firestore](https://img.shields.io/badge/Firebase-Firestore%20%26%20Auth-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com/)

---

## 📖 Overview

**Madhyamik AI Mitra** is a specialized, autonomous AI study and research companion engineered specifically for West Bengal Board of Secondary Education (**WBBSE**) Class 10 (Madhyamik Pariksha) students across all seven core subjects:
- **Physical Science** (ভৌত বিজ্ঞান)
- **Life Science** (জীবন বিজ্ঞান)
- **Mathematics** (গণিত)
- **History** (ইতিহাস)
- **Geography** (ভূগোল)
- **Bengali** (বাংলা)
- **English** (ইংরেজি)

It combines a structured 10-year WBBSE Previous Year Question (**PYQ**) knowledge base (2016–2026), live **ABTA & WBTA** Test Paper trend cross-referencing, an interactive **Blackboard Teacher Problem Solver**, and a real-time **Live Voice Viva & Concept Tutor** powered by the Gemini Live API.

---

## ✨ Key Features

### 1. 🎯 10-Year PYQ & ABTA/WBTA Trend Analysis
- Instant chapter-wise analysis across 10 years of verified Madhyamik board exams.
- Cross-references All Bengal Teachers' Association (**ABTA**) and West Bengal Teachers' Association (**WBTA**) test paper frequency.
- Explicit board marking weights (1-mark MCQs, 2-mark conceptual questions, 3-mark & 5-mark structured questions, and 8-mark essay questions).
- High Probability, Repeated Trend, and Concept Builder badges for strategic exam revision.

### 2. 🗣️ Strict Bilingual Mirroring (বাংলা & English)
- Fully respects the student's language choice: asking in Bengali (or natural Banglish) yields complete, idiomatic responses in standard Bengali script (বাংলা).
- English-medium WBBSE students receive crisp explanations in clear academic English.
- Natural phonetics for spoken mathematical and scientific notation (Greek letters, subscripts, formulas) for classroom audio readout.

### 3. 📐 Interactive Blackboard Teacher Problem Solver
- Exclusively scoped to **Mathematics** and **Physical Science** numericals and proofs.
- Functions like a supportive teacher standing at a green chalkboard: breaks down problems into progressive sections rather than dumping a wall of text.
- Voice narration feature reads out the teacher's explanation.
- Step-by-step confirmation prompts: student must confirm understanding before advancing to the next chalkboard section.
- Integrated simplification levels (Levels 1–5) with concrete real-life analogies when students ask for clarification.

### 4. 🎙️ Live Voice Viva & Oral Examiner Prep
- Full-duplex voice session powered by Gemini Live Audio API over WebSockets (`gemini-3.8-live`).
- Realistic viva exam practice: oral questioning, instant feedback, and encouraging guidance.
- Audio visualizer with real-time bidirectional transcription (student & tutor speech).
- Complete session transcripts automatically formatted and synced to study sessions.

### 5. 📄 Multi-Format Paper & Syllabus Upload
- Upload snapshots or documents of problems, textbook exercises, and test papers.
- Supports **Images (PNG, JPG, WEBP)**, **PDFs (.pdf)**, and **Text notes (.txt)**.
- Automatic AI extraction of chapter, topic, and numerical data for targeted solutions.

### 6. 🎥 Verified YouTube Recommendations
- Curated video lectures aligned with the exact WBBSE Class 10 topic.
- Live availability validation via YouTube oEmbed API to eliminate broken, private, or hallucinated video links.

### 7. 🔒 Secure Google Authentication & Firestore Sync
- Google OAuth login with email verification.
- Cloud Firestore persistence for sessions, chat history, attachments, and voice transcripts.
- Strict security rules with owner isolation, input sanitization, and size constraints.

---

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4, Motion (Framer Motion 12), Lucide Icons, React Markdown & Remark GFM
- **Backend Server:** Node.js, Express, TypeScript via TSX, WebSocket (`ws`)
- **AI Models & SDKs:**
  - `@google/genai` (Google Gen AI SDK)
  - `gemini-4-hydrogen` (Deep reasoning & Google Search grounding)
  - `gemini-3.8-live` (Low-latency bidirectional audio voice tutor)
  - `gemini-3.8-flash-lite-tts` (Teacher speech synthesis)
  - `gemini-3.1-flash-lite` (Fast fallback inference)
- **Database & Auth:** Google Firebase Auth, Cloud Firestore

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20.0.0 or higher
- **npm** or **bun** / **yarn**
- **Gemini API Key**: Obtain from [Google AI Studio](https://aistudio.google.com/)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/pradipta2005/madhyamik-ai-mitra.git
cd madhyamik-ai-mitra
npm install
```

### 2. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```
Edit `.env` and set your configuration:
```env
# Gemini API Key (Required)
GEMINI_API_KEY="your-gemini-api-key-here"

# Server Host URL (Default: http://localhost:3000)
APP_URL="http://localhost:3000"
```

### 3. Firebase Authentication & Authorized Domains
If you encounter `Firebase: Error (auth/unauthorized-domain)` during Google Sign-In, Firebase requires your running domain to be whitelisted:
1. Go to the [Firebase Console Authentication Settings](https://console.firebase.google.com/project/gen-lang-client-0687209894/authentication/settings).
2. Under the **Settings** tab, scroll down to **Authorized domains**.
3. Click **Add domain** and enter your hostname (e.g. `localhost` or your custom domain).
4. *Quick tip:* Accessing via `http://localhost:3000` rather than `http://127.0.0.1:3000` is recommended, as Firebase includes `localhost` by default.
5. *Guest Student Mode:* You can also click **Continue as Guest** to test and use all research, blackboard solver, and voice features immediately using local storage without Google authentication.

### 4. Run Development Server
```bash
npm run dev
```
The application will start on `http://localhost:3000`.

### 5. Build for Production
```bash
# Build optimized production bundle
npm run build

# Start production server
npm start
```

---

## 🧪 Testing & Code Quality

Run the comprehensive unit test suite:
```bash
npm test
```
Tests cover:
- Language detection (Bengali Unicode, Banglish, English)
- Query intent classification (PYQ, Concept, Problem Solve, Voice)
- PYQ knowledge base search across all 7 subjects
- Assistant response block parsing & YouTube recommendation constraints
- Date grouping for study sessions
- Live voice transcript summary formatting
- Blackboard section extraction & Firestore sanitization
- Audio phonetic normalization for mathematical and scientific symbols
- Cloud Firestore security rules specification

To check TypeScript types:
```bash
npm run lint
```

To clean build artifacts:
```bash
npm run clean
```

---

## 📁 Project Structure

```
madhyamik-ai-mitra/
├── .env.example                  # Environment configuration template
├── eslint.config.mjs             # ESLint configuration
├── firebase-applet-config.json   # Firebase client configuration
├── firebase-blueprint.json       # Schema definition for Firestore collections
├── firestore.rules               # Production Firestore security rules
├── firestore.rules.test.ts       # Test suite for Firestore rules
├── index.html                    # Application entry HTML
├── metadata.json                 # AI Studio applet metadata
├── package.json                  # Dependencies & scripts
├── public/                       # Static assets, web app manifest, icons
├── security_spec.md              # Security rules architecture documentation
├── server.ts                     # Express + WebSocket backend server
├── tsconfig.json                 # TypeScript compiler configuration
├── vite.config.ts                # Vite build configuration with chunk splitting
└── src/
    ├── App.tsx                   # Main application workspace & state manager
    ├── firebase.ts               # Firebase initialization & Firestore operations
    ├── index.css                 # Global styling & Tailwind CSS directives
    ├── main.tsx                  # React DOM root entry
    ├── types.ts                  # Shared TypeScript interfaces & types
    ├── assets/                   # Images and visual assets
    ├── components/               # React UI components
    │   ├── BrandLogo.tsx         # Handcrafted Scholar's Folio brand emblem
    │   ├── ChatInputBar.tsx      # Multi-modal input with speech recognition
    │   ├── ChatMessageBubble.tsx # Message rendering with Markdown & cards
    │   ├── ErrorBoundary.tsx     # Graceful error fallback
    │   ├── LandingPage.tsx       # Interactive landing page
    │   ├── LiveVoiceModal.tsx    # Gemini Live WebSocket voice viva interface
    │   ├── ProblemSolveCard.tsx  # Interactive Blackboard teacher solution card
    │   ├── ProblemSolverBanner.tsx # Subject scope notice banner
    │   ├── PyqCard.tsx           # WBBSE & ABTA/WBTA PYQ card with trend notes
    │   ├── Sidebar.tsx           # Study session history & file upload manager
    │   ├── SignInGateModal.tsx   # Google OAuth authentication gate modal
    │   ├── SubjectBar.tsx        # 7-subject filter & lock toolbar
    │   ├── YouTubeCard.tsx       # Verified YouTube recommendation card
    │   └── ui/
    │       └── CraftMotion.tsx   # Micro-interactions & animations
    ├── data/
    │   └── wbbse_pyq_bank.json   # 10-year WBBSE PYQ structured database
    └── utils/
        ├── wbbseResearch.ts      # Research engine, text normalization, parsing
        └── wbbseResearch.test.ts # Core utility test suite
```

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health check & system status (uptime, pyq count, Gemini status) |
| `/api/research` | `POST` | Core research engine with Google Search Grounding & PYQ analysis |
| `/api/tts` | `POST` | Teacher speech audio synthesis for blackboard solutions |
| `/api/upload-pdf` | `POST` | Multi-format document / question paper analyzer |
| `/api/live-ws` | `WS` | Full-duplex WebSocket for Gemini Live Audio Viva Tutoring |

---

## 📄 License & Credits

Created by [Pradipta](https://pradipta2005.github.io/) for West Bengal Board Class 10 (Madhyamik) students.
Educational use. Built with Google Gemini API & Firebase.

# PseudoPy — Automated Code Generation System

> **Translating Pseudocode and Python: An Algorithmic Approach to Automated Code Generation**

A web-based system that translates pseudocode into executable Python code, built as a Progressive Web App (PWA) with full mobile responsiveness.

## ✨ Features

- **Pseudocode-to-Python Translation Engine** — Rule-based converter supporting IF/ELSE, FOR, WHILE, FUNCTION, SET, DISPLAY, and more
- **In-Browser Code Execution** — Run Python directly in the browser via Skulpt
- **Feedback & Suggestions** — Analyze pseudocode for structure, syntax balance, and quality
- **Automatic Role-Based Access** — Student, Instructor, and Admin dashboards
- **Exercise Management** — Instructors create exercises, students practice pseudocode
- **Learning Analytics** — Track submissions, success rates, and common errors
- **PWA Support** — Installable on Android and iOS, works offline
- **Fully Responsive** — Optimized for phones, tablets, and desktops

## 🚀 Quick Start

Configure the server credentials described in [local development and deployment](docs/local-development.md), then run:

```bash
npm ci
npm start
```

Open [http://localhost:3000](http://localhost:3000). A static file server alone cannot provide authenticated database operations. Existing Firestore accounts are retained; there are no automatically seeded production accounts.

## 📱 Mobile / PWA

- **Android**: Open in Chrome → "Add to Home Screen"
- **iOS**: Open in Safari → Share → "Add to Home Screen"

## 🛠️ Tech Stack

- Vanilla HTML, CSS, JavaScript (no frameworks)
- [Skulpt](https://skulpt.org/) for Python execution
- Service Worker for offline caching
- Firestore through authenticated Express/Vercel APIs for durable records
- Per-user localStorage for editor drafts and recent personal metrics

## 📄 License

MIT


## Compiler rules and regression checks

See [the supported language and verification notes](docs/compiler-language.md) for exact operator semantics, loop bounds, syntax rules and test limitations. Run `npm test` with Node.js 22+ and Python 3 to check the compiler and role navigation behavior.

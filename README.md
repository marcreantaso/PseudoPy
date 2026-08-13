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

```bash
# Using Node.js http-server
npx http-server . -p 8080

# Or Python
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080)

## 🔐 Test Accounts

| Role | Username | Password |
|------|----------|----------|
| Student | `mdaet` | `pass123` |
| Instructor | `mreantaso` | `pass123` |
| Admin | `mbautista` | `admin123` |

## 📱 Mobile / PWA

- **Android**: Open in Chrome → "Add to Home Screen"
- **iOS**: Open in Safari → Share → "Add to Home Screen"

## 🛠️ Tech Stack

- Vanilla HTML, CSS, JavaScript (no frameworks)
- [Skulpt](https://skulpt.org/) for Python execution
- Service Worker for offline caching
- localStorage for data persistence

## 📄 License

MIT

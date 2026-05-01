# Queries Generator

A web-based SQL query generator tool that helps support teams quickly produce database queries for common operations — without needing to write SQL manually.

## Features

| Module | Description |
|---|---|
| **Inquiry** | Generate SELECT queries to look up records |
| **Bulk Rejection** | Generate queries to reject multiple records at once |
| **Manual Registration** | Generate INSERT queries for manual record registration |
| **Reroute** | Generate queries to reroute records to a different path |
| **Conversion** | Generate queries for data type or status conversions |
| **Transfer History** | Generate queries to retrieve transfer history records |

## Tech Stack

- [Vue 3](https://vuejs.org/) — Composition API with `<script setup>`
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) — build tool and dev server
- [Tailwind CSS](https://tailwindcss.com/) — utility-first styling
- [Radix Vue](https://www.radix-vue.com/) — accessible UI primitives
- [Lucide Vue Next](https://lucide.dev/) — icon set
- [XLSX](https://sheetjs.com/) — Excel file parsing for batch uploads

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build

```bash
npm run build
```

Output will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
├── assets/          # Global styles
├── components/
│   ├── ui/          # Reusable base UI components (Button, Card, Badge, etc.)
│   ├── Inquiry.vue
│   ├── BulkRejection.vue
│   ├── ManualRegistration.vue
│   ├── Reroute.vue
│   ├── Conversion.vue
│   ├── TransferHistory.vue
│   └── BatchUpload.vue
├── lib/
│   └── utils.ts     # Utility helpers
├── App.vue          # Root component with sidebar navigation
└── main.ts          # App entry point
```

# ParcelFlow — Code Style Guide

This document describes the coding conventions and patterns used in the ParcelFlow codebase. Follow these conventions when adding or modifying code.

---

## 1. Language & Runtime

- **TypeScript** (strict mode) for all source files
- **React 19** with functional components only (no class components)
- **Node.js** backend with Express 4
- **tsx** for server-side TypeScript execution in development
- **esbuild** for production server bundle

---

## 2. File Naming

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase | `CustomerPortal.tsx`, `CartDrawer.tsx` |
| Pages | PascalCase with portal prefix | `CustomerHome.tsx`, `OperatorDashboard.tsx` |
| Server modules | camelCase | `auth.ts`, `orderStateMachine.ts` |
| Utilities | camelCase | `api.ts`, `formatters.ts`, `socket.ts` |
| Types | camelCase | `types.ts` |
| CSS | camelCase | `index.css` |

---

## 3. Directory Structure

```
src/
├── portals/           # Feature-based portal directories
│   ├── auth/          # Authentication pages
│   ├── customer/      # Customer portal
│   │   ├── components/  # Portal-specific components
│   │   └── pages/       # Portal page components
│   ├── operator/      # Operator portal (same structure)
│   └── admin/         # Admin portal (same structure)
├── shared/            # Cross-portal shared code
│   ├── components/    # Reusable UI components
│   ├── layouts/       # Layout components
│   ├── lib/           # Utility functions
│   └── store/         # Context providers (state management)
├── server/            # Backend code
│   └── hardware-simulator/  # Hardware simulation engine
├── App.tsx            # Root component
├── main.tsx           # React entry point
├── index.css          # Global CSS
└── types.ts           # Shared TypeScript types
```

---

## 4. Component Conventions

### Exports
- Named exports for all components: `export const CustomerPortal: React.FC = () => { ... }`
- No default exports for components (except `App` in `App.tsx`)

### Type Annotations
- Use `React.FC` for components without props
- Use `React.FC<Props>` for components with props
- Define prop interfaces inline or above the component

### State Management
- `useState` for local component state
- React Context (`createContext` + `useContext`) for global state (auth, toast)
- No external state management library (no Redux, Zustand, etc.)

### Data Fetching
- `useEffect` for initial data fetching
- `apiFetch` utility for all API calls (handles auth headers automatically)
- Error handling with try/catch in async handlers

### Example Pattern
```tsx
import React, { useState, useEffect } from 'react';
import { SomeType } from '../../types';
import { apiFetch } from '../../shared/lib/api';

interface Props {
  orderId: string;
  onBack: () => void;
}

export const SomePage: React.FC<Props> = ({ orderId, onBack }) => {
  const [data, setData] = useState<SomeType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SomeType>(`/some-endpoint/${orderId}`)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return <Skeleton />;
  if (error) return <ErrorState message={error} />;

  return ( /* JSX */ );
};
```

---

## 5. TypeScript Conventions

### Types
- Use `type` for union types and simple aliases: `type Role = 'customer' | 'operator' | 'admin'`
- Use `interface` for object shapes: `interface User { id: string; ... }`
- All types defined in `src/types.ts` for cross-module sharing
- Server-specific types defined inline in server files

### Generics
- `apiFetch<T>` — typed API responses
- `query<T>` / `queryOne<T>` — typed database query results
- `useState<T>` — typed state variables

### Error Handling
- `catch (err: any)` for error handlers (TypeScript strict mode)
- Extract error message: `err.message || 'Fallback message'`

---

## 6. API Conventions

### Endpoint Naming
- RESTful verbs: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
- Noun-based paths: `/api/orders`, `/api/cart/items`
- Nested resources: `/api/orders/:id/status`, `/api/warehouse/orders/:orderId/picked`
- Multi-path aliases: `router.get(['/cart', '/cart/items'], ...)` for backward compatibility

### Request/Response
- JSON request bodies (`Content-Type: application/json`)
- JSON responses for all endpoints
- Error responses: `{ error: "Human-readable error message" }`
- Success responses: `{ success: true, ...data }` or direct data object

### Auth Headers
- `Authorization: Bearer <jwt-token>` (primary)
- `x-user-id: <user-id>` (fallback/legacy)

---

## 7. Database Conventions

### SQL Style
- `UPPER CASE` for SQL keywords: `SELECT`, `WHERE`, `INSERT INTO`
- Parameterized queries with `?` placeholders (never string concatenation)
- Template literals for multi-line SQL

### ID Generation
- User IDs: `usr-${Date.now()}`
- Order IDs: `ORD-${sequential_number}`
- Invoice IDs: `INV-2026-${order_number}`
- Other IDs: `${prefix}-${Date.now()}` (e.g., `cart-`, `addr-`, `pick-`, `sort-`)

### Timestamps
- Format: `datetime('now')` in SQL
- JavaScript: `new Date().toISOString().replace('T', ' ').substring(0, 19)`

---

## 8. CSS / Styling

- **Tailwind CSS 4** via the `@tailwindcss/vite` plugin
- Utility-first approach — no custom CSS classes
- Single CSS file: `src/index.css` with `@import "tailwindcss"`
- Responsive: mobile-first with `sm:`, `md:`, `lg:` breakpoints
- See `DESIGN_SYSTEM.md` for the full visual design reference

---

## 9. Import Order

```tsx
// 1. React and React hooks
import React, { useState, useEffect } from 'react';

// 2. Types
import { User, Order } from '../../types';

// 3. Shared utilities and contexts
import { apiFetch } from '../../shared/lib/api';
import { useAuth } from '../../shared/store/authContext';
import { useToast } from '../../shared/store/toastContext';

// 4. Shared components
import { Card } from '../../shared/components/Card';

// 5. Local components and pages
import { CustomerHeader } from './components/CustomerHeader';
import { CustomerHome } from './pages/CustomerHome';

// 6. Icons (lucide-react)
import { Package, ArrowRight } from 'lucide-react';
```

---

## 10. Error Handling Patterns

### Frontend
```tsx
// Async handler with error state
const handleAction = async () => {
  try {
    await apiFetch('/endpoint', { method: 'POST', body: JSON.stringify(data) });
    showToast('Success message', 'success');
  } catch (err: any) {
    showToast(err.message || 'Fallback error message', 'error');
  }
};
```

### Backend
```tsx
// Validate input → Check authorization → Execute → Return
router.post('/endpoint', requireUser, (req: AuthenticatedRequest, res: Response) => {
  const { field } = req.body;
  if (!field) {
    return res.status(400).json({ error: 'Field is required' });
  }

  const user = req.user!;
  if (user.role === 'customer' && resource.owner_id !== user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Execute operation...
  return res.json({ success: true });
});
```

---

## 11. Formatting

- **Indentation:** 2 spaces
- **Semicolons:** Required
- **Quotes:** Single quotes for strings, backticks for template literals
- **Trailing commas:** In multi-line arrays/objects
- **Line length:** No hard limit; use readability judgment
- **JSX:** Self-closing tags for void elements (`<input />`, `<br />`)

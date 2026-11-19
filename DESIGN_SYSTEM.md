# ParcelFlow — Design System

This document describes the existing visual design system used throughout ParcelFlow. Any new UI additions should follow these conventions to maintain visual consistency.

---

## 1. Color Palette

### Authentication Pages (Dark Theme)
| Token | Value | Usage |
|---|---|---|
| Background | `bg-zinc-900` | Page background |
| Card | `bg-zinc-950` | Auth card container |
| Card border | `border-zinc-800` | Card borders |
| Input background | `bg-zinc-900` | Form inputs |
| Input border | `border-zinc-800` | Input borders |
| Input focus ring | `ring-orange-500/40` | Focus state |
| Input focus border | `border-orange-500` | Focus state |
| Text primary | `text-white` | Headings, important text |
| Text secondary | `text-zinc-300` | Labels, secondary content |
| Text tertiary | `text-zinc-400` | Descriptions, hints |
| Text muted | `text-zinc-500` | Placeholders, subtle text |
| Primary accent | `bg-orange-600` / `hover:bg-orange-500` | Buttons, links |
| OAuth / Google Button | `bg-zinc-900 hover:bg-zinc-800/90 border-zinc-800 text-zinc-200` | Google Sign-In button |
| Error | `bg-red-950/80`, `border-red-800/80`, `text-red-200` | Error alerts |
| Success | `bg-emerald-950/80`, `border-emerald-800/80`, `text-emerald-200` | Success alerts |
| Status dot | `bg-emerald-400 animate-ping` | Online indicator |

### Customer Portal (Light Theme)
| Token | Value | Usage |
|---|---|---|
| Background | `bg-zinc-50` | Page background |
| Card | `bg-white` | Content cards |
| Border | `border-zinc-200` | Card/section borders |
| Text primary | `text-zinc-900` | Body text |
| Text secondary | `text-zinc-600` | Secondary content |
| Text muted | `text-zinc-500` | Metadata |
| Accent | `orange-600` | Buttons, highlights |
| Selection | `selection:bg-orange-500/20 selection:text-orange-950` | Text selection |

### Operator Portal
| Token | Value | Usage |
|---|---|---|
| Background | `bg-zinc-100` | Page background |
| Sidebar | Dark zinc tones | Navigation sidebar |
| Status colors | `emerald`, `teal`, `amber`, `red` | Machine/order status |

### Admin Portal
| Token | Value | Usage |
|---|---|---|
| Background | `bg-zinc-100` | Page background |
| Cards | `bg-white` | Dashboard cards |
| KPI accents | `indigo`, `emerald`, `orange`, `teal` | KPI card highlights |

### Global Top Bar
| Token | Value | Usage |
|---|---|---|
| Background | `bg-zinc-900` | Global bar |
| Border | `border-zinc-800` | Bottom border |
| Text | `text-zinc-300` | User info text |

---

## 2. Typography

- **Font family:** System font stack via Tailwind's `font-sans` + `antialiased`
- **Selection:** `selection:bg-orange-500/20 selection:text-orange-950`

| Element | Classes |
|---|---|
| Page heading | `text-2xl sm:text-3xl font-bold tracking-tight text-white` |
| Section heading | `text-xs font-semibold uppercase tracking-wider text-zinc-400` |
| Card heading | `text-sm font-semibold text-zinc-900` |
| Body text | `text-xs sm:text-sm text-zinc-300` (dark) or `text-zinc-600` (light) |
| Label | `text-xs font-medium text-zinc-300` |
| Caption | `text-[11px] text-zinc-500` |
| Monospace | `font-mono text-[11px]` (emails, codes, tokens) |

---

## 3. Spacing & Layout

- **Page padding:** `p-4 sm:p-6 lg:p-8`
- **Max width:** `max-w-7xl mx-auto` (content areas), `max-w-md` (auth forms)
- **Card padding:** `p-6 sm:p-7` (auth card), `p-4 sm:p-5` (content cards)
- **Space between sections:** `space-y-6` (page level), `space-y-5` (card level), `space-y-4` (form fields)
- **Input vertical padding:** `py-2.5` (login inputs), `py-2` (signup inputs)
- **Gap utilities:** `gap-2`, `gap-2.5`, `gap-4`, `gap-6`

---

## 4. Border Radius

| Element | Radius |
|---|---|
| Cards | `rounded-2xl` |
| Inputs | `rounded-xl` |
| Buttons | `rounded-xl` |
| Badges/pills | `rounded-full` |
| Alert boxes | `rounded-xl` |
| Sidebar items | `rounded-lg` |
| Table action buttons | `rounded` |

---

## 5. Shadows

| Element | Shadow |
|---|---|
| Auth card | `shadow-2xl` |
| Demo accounts card | `shadow-lg` |
| Global bar | `shadow-xs` |
| Buttons | `shadow-md` |
| Badges | `shadow-xs` |

---

## 6. Components

### Button (Primary)
```
bg-orange-600 hover:bg-orange-500 text-white rounded-xl
font-medium text-xs sm:text-sm transition-all shadow-md
active:scale-[0.99] cursor-pointer
disabled:opacity-60 disabled:cursor-not-allowed
```

### Input Field
```
w-full pl-10 pr-3.5 py-2.5
bg-zinc-900 border border-zinc-800 rounded-xl
text-xs sm:text-sm text-white placeholder-zinc-500
focus:outline-none focus:ring-2 focus:ring-orange-500/40
focus:border-orange-500 transition-colors
```

### Alert (Error)
```
p-3 bg-red-950/80 border border-red-800/80 text-red-200
text-xs rounded-xl flex items-start gap-2.5 leading-relaxed
```

### Alert (Success)
```
p-3 bg-emerald-950/80 border border-emerald-800/80 text-emerald-200
text-xs rounded-xl flex items-start gap-2.5 leading-relaxed
```

### Info Notice
```
p-2.5 bg-zinc-900 border border-zinc-700 rounded-xl
text-[11px] text-zinc-300 flex items-start gap-2
```

### Link Button
```
text-xs text-zinc-400 hover:text-orange-400
transition-colors cursor-pointer
```

### Highlighted Link Text
```
font-semibold text-orange-400
underline decoration-orange-400/40 underline-offset-2
```

---

## 7. Icons

All icons use **Lucide React** (`lucide-react` package).

Standard icon sizes:
- In inputs: `w-4 h-4`
- In headers: `w-3.5 h-3.5`
- Decorative: `w-2 h-2`

Common icons:
- `Mail` — email fields
- `Lock` — password fields
- `User` — name fields
- `Phone` — phone fields
- `Eye` / `EyeOff` — password visibility toggle
- `ArrowRight` — submit button arrows
- `AlertCircle` — error alerts
- `CheckCircle` — success alerts
- `KeyRound` — password reset / tokens
- `ShieldAlert` — security notices
- `LogOut` — logout button
- `UserCheck` — authenticated user indicator

---

## 8. Animations & Transitions

| Element | Animation |
|---|---|
| Status dot | `animate-ping` (Tailwind built-in) |
| Buttons | `active:scale-[0.99]` (press feedback) |
| Inputs/buttons | `transition-colors` (hover/focus) |
| Buttons | `transition-all` (comprehensive) |
| Page scroll | `window.scrollTo({ top: 0, behavior: 'smooth' })` |
| Motion library | `motion` (Framer Motion) used in some portal pages |

---

## 9. Responsive Breakpoints

The project uses Tailwind's default breakpoints:

| Breakpoint | Min Width | Usage |
|---|---|---|
| (default) | 0px | Mobile-first base styles |
| `sm:` | 640px | Tablet adjustments |
| `md:` | 768px | Sidebar layouts |
| `lg:` | 1024px | Desktop padding |

Key responsive patterns:
- Auth forms: `max-w-md` centered on all sizes
- Portal layouts: `flex flex-col md:flex-row` (sidebar collapses on mobile)
- Content: `max-w-7xl mx-auto px-4 sm:px-6`
- Typography: `text-xs sm:text-sm`, `text-2xl sm:text-3xl`
- Hidden elements: `hidden sm:inline` (subtitle text on mobile)

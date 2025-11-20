# YOUWARE Mobile Template - React Mobile Development Guide

This is a mobile-first React application template built with React 18, TypeScript, Vite, and Tailwind CSS, specifically designed for creating mobile projects in the AI Vibe Coding community. Applications run seamlessly in Native WebView or mobile browsers.

**🚨 MANDATORY: AI models MUST use `src/utils/mobileFeatures.ts` for image downloads and device feedback. Direct Web API usage (`link.click()`, `navigator.vibrate()`) will fail on mobile devices.**

## IMPORTANT: Update This File After Completion

After completing user requirements, please update this YOUWARE.md file to:
1. Remove the template notice section
2. Add specific project details and documentation
3. Include any special instructions for future development
4. Document key features implemented for the user
5. Summarize and extract the main mobile rules from this document and keep them
6. Follow the user's preferred language, not the default language of this file

## Project Status

- **Project Type**: React + TypeScript Mobile Web Application Template
- **Entry Point**: `src/main.tsx` (React application entry)
- **Build System**: Vite 7.0.0 (Fast development and build)
- **Styling System**: Tailwind CSS 3.4.17 (Mobile-first atomic CSS framework)
- **Target Platforms**: iOS Safari, Android Chrome, Native WebView
- **Responsive Design**: 375px-430px mobile containers

## Core Design Principles

### Mobile-First Strategy
- **Touch-Optimized Interactions**: All UI elements designed for finger navigation (44px minimum touch targets)
- **Gesture-Native Experience**: Swipe, tap, long press, and pinch interactions
- **No Hover Dependencies**: Active states replace hover effects for mobile compatibility
- **Safe Area Compliance**: Full support for notched devices (iPhone X+, Android with notches)
- **Performance-First**: Optimized for mobile device constraints and network conditions

IMPORTANT: When users don't specify UI preferences, always default to modern, minimalist mobile design that prioritizes usability on small screens.

### Mobile Visual Excellence
- **Native-Like Aesthetics**: Visual design that mimics native mobile app experiences
- **Typography Hierarchy**: Mobile-optimized font sizes and line heights for readability
- **Touch Feedback Systems**: Clear visual responses to user interactions
- **Adaptive Layouts**: Content automatically adjusts to different mobile screen sizes
- **High Contrast Design**: Ensures visibility under various lighting conditions

### Technical Excellence
- Native-first device integration with web fallbacks
- TypeScript-enforced mobile component interfaces
- React 18 concurrent features for smooth mobile performance
- Zustand for lightweight mobile state management
- Mobile-optimized routing with React Router DOM

## Project Architecture

### Directory Structure

```
project-root/
├── index.html              # Mobile-optimized HTML with viewport meta tags
├── package.json            # Mobile-focused dependencies and scripts
├── vite.config.ts         # Vite configuration with mobile optimizations
├── tailwind.config.js     # Mobile-first Tailwind utilities
├── tsconfig.json          # TypeScript configuration
└── src/                   # Source code directory
    ├── App.tsx            # Main mobile app component
    ├── main.tsx           # Application entry point
    ├── index.css          # Mobile-first CSS with touch optimizations
    ├── components/        # Reusable mobile components
    ├── pages/             # Mobile page components
    ├── store/             # Mobile state management
    ├── types/             # TypeScript type definitions
    └── utils/             # Mobile utility functions
        └── mobileFeatures.ts  # 🚨 CRITICAL: Mobile device API library
```

### Mobile Code Organization

- Touch-first component design with clear interaction hierarchies
- TypeScript interfaces optimized for mobile data structures
- Component modularity for mobile performance and maintainability
- Mobile-specific error boundaries and loading states

## Tech Stack

### Core Framework
- **React**: 18.3.1 - Declarative UI library
- **TypeScript**: 5.8.3 - Type-safe JavaScript superset
- **Vite**: 7.0.0 - Next generation frontend build tool
- **Tailwind CSS**: 3.4.17 - Atomic CSS framework with mobile-first extensions

### Routing and State Management
- **React Router DOM**: 6.30.1 - Client-side routing
- **Zustand**: 4.4.7 - Lightweight state management

### Internationalization Support
- **i18next**: 23.10.1 - Internationalization core library
- **react-i18next**: 14.1.0 - React integration for i18next
- **i18next-browser-languagedetector**: 7.2.0 - Browser language detection

### UI and Styling
- **Lucide React**: Beautiful icon library
- **Headless UI**: 1.7.18 - Unstyled UI components
- **Framer Motion**: 11.0.8 - Powerful animation library
- **GSAP**: 3.13.0 - High-performance professional animation library
- **clsx**: 2.1.0 - Conditional className utility

### 3D Graphics and Physics
- **Three.js**: 0.179.1 - JavaScript 3D graphics library
- **Cannon-es**: Modern TypeScript-enabled 3D physics engine
- **Matter.js**: 0.20.0 - 2D physics engine for web

### Mobile Device Integration
- **Custom mobileFeatures.ts**: Native device API wrappers
- **WebView Bridge**: Native app communication capabilities
- **Progressive Web App**: Mobile browser optimization features

## Mobile Device Integration Library

This template features a comprehensive mobile device integration system via `src/utils/mobileFeatures.ts` that provides 6 core mobile capabilities:

- **Image Capture & Save**: Photo capture from camera streams and gallery/download saving
- **Device Feedback**: Vibration patterns and haptic feedback for mobile interactions
- **WebView Bridge**: Native app communication for enhanced mobile experiences
- **Environment Detection**: Smart WebView vs. browser environment handling
- **Permission Management**: iOS-compatible permission handling with fallbacks
- **Cross-Platform APIs**: Unified interface across iOS Safari, Android Chrome, and WebView

CRITICAL: Always examine the existing mobileFeatures.ts implementation first before using device capabilities. This reference implementation contains essential native-first patterns, WebView bridge logic, and fallback strategies that must be understood and adapted for your mobile use case.

### Mobile API Usage Guidelines

**Important**: Mobile device APIs serve as **reference implementations** requiring customization:

1. **Mobile Requirements Analysis**: Understand device integration needs and target mobile platforms
2. **API Implementation Study**: Review mobileFeatures.ts to understand native bridge patterns and fallback strategies
3. **Selective Implementation**: Choose APIs based on mobile app requirements, not all capabilities
4. **Platform Optimization**: Customize WebView bridge calls and permission handling for target platforms
5. **Mobile Testing**: Validate across iOS Safari, Android browsers, and various WebView environments
6. **Performance Tuning**: Optimize device API usage for mobile performance constraints

### Mobile Platform Strategy

- **Cross-Platform Consistency**: Ensure uniform behavior across iOS, Android, and WebView environments
- **Native Integration**: Leverage WebView capabilities while maintaining browser compatibility  
- **Smart Permissions**: Implement mobile-optimized permission flows that minimize user friction
- **Performance Adaptation**: Optimize all device interactions for mobile hardware limitations
- **Mobile-First Fallbacks**: Design graceful degradation for limited mobile environments

## 🚨 CRITICAL: Mandatory Mobile APIs

### Required mobileFeatures.ts Usage

**FORBIDDEN Patterns - These WILL BREAK on mobile:**
```typescript
// ❌ NEVER DO THIS - Direct download will fail on mobile
const downloadImage = () => {
  const link = document.createElement('a');
  link.href = imageData;
  link.download = 'image.png';
  link.click(); // ❌ Fails on iOS Safari and WebView
};

// ❌ NEVER DO THIS - Direct vibration has no iOS support
navigator.vibrate(200); // ❌ No WebView integration
```

**MANDATORY Patterns - Always use these:**
```typescript
// ✅ CORRECT - Always use mobileFeatures.ts
import { saveImageToDevice, vibrate, hapticFeedback } from './utils/mobileFeatures';

const downloadImage = async () => {
  const success = await saveImageToDevice(imageData, 'image.png');
  if (success) {
    vibrate(100); // Success feedback
  }
};

// ✅ WebView-aware haptic feedback
hapticFeedback('medium'); // iOS-style feedback when available
```

**WebKit APIs you CAN use directly:**
```typescript
// ✅ These standard APIs work fine on mobile
navigator.mediaDevices.getUserMedia({ video: true });
navigator.mediaDevices.getUserMedia({ audio: true });
```

## Mobile Layout System

### 🚨 CRITICAL: Safe Area Implementation

**MANDATORY: All mobile templates MUST implement proper safe area handling for notched devices.**

The mobile template is designed for full-screen containers with safe area insets for content. This ensures the app works perfectly on all iOS devices including iPhone X series and newer with notches/Dynamic Island.

**Required Safe Area Structure:**

```tsx
// ✅ MANDATORY: Full-screen background with safe area content
function App() {
  return (
    <div className="w-full h-dvh">
      {/* Full-screen background container - fills entire screen including notch areas */}
      <main className="w-full h-full relative">
        {/* Content safe area container - avoids notch and home indicator */}
        <div
          className="w-full h-full flex flex-col"
          style={{
            paddingTop: "env(safe-area-inset-top)",      // ⚠️ CRITICAL for notch
            paddingBottom: "env(safe-area-inset-bottom)",  // ⚠️ CRITICAL for home indicator
            paddingLeft: "env(safe-area-inset-left)",     // For landscape mode
            paddingRight: "env(safe-area-inset-right)",   // For landscape mode
          }}
        >
          {/* Your actual content goes here - automatically avoids notch */}
          <div className="flex-1 flex flex-col justify-center items-center px-4">
            {/* Content that needs to be visible and interactive */}
          </div>
        </div>
      </main>
    </div>
  );
}
```

**Why This Structure is MANDATORY:**

1. **Background Layer**: `h-dvh` fills entire screen including notch/status bar areas
2. **Content Layer**: `env(safe-area-inset-*)` ensures content avoids notch and home indicator
3. **Visual Continuity**: Background shows behind notch for seamless native app experience
4. **Touch Safety**: All interactive elements automatically stay in touchable areas

**❌ WRONG - Avoiding safe areas entirely:**
```tsx
// This leaves ugly gaps on notched devices
<div className="h-screen-safe"> {/* Creates gaps, looks unprofessional */}
```

**✅ CORRECT - Full screen with safe insets:**
```tsx
// Professional native-like experience
<div className="h-dvh bg-gradient-to-b from-blue-50 to-white">
  <div style={{ paddingTop: "env(safe-area-inset-top)" }}>
    {/* Content here */}
  </div>
</div>
```

**Available Safe Area Utilities:**
- `env(safe-area-inset-top)` - Distance from top edge to safe area (handles notch)
- `env(safe-area-inset-bottom)` - Distance from bottom edge to safe area (handles home indicator)
- `env(safe-area-inset-left)` - Distance from left edge (landscape mode)
- `env(safe-area-inset-right)` - Distance from right edge (landscape mode)

**IMPORTANT for Lists and Scrollable Content:**
```tsx
// ✅ CORRECT: Safe area with internal scrolling
<div style={{ paddingTop: "env(safe-area-inset-top)" }}>
  <header className="flex-none p-4">Header stays visible</header>
  <div className="flex-1 overflow-y-auto px-4">
    {/* Long list content scrolls internally */}
    {items.map(item => <div key={item.id}>{item.content}</div>)}
  </div>
</div>
```

### Mobile Container Strategy

```typescript
// ✅ RESPONSIVE: Adapts to different mobile screen sizes (recommended)
<div className="w-full max-w-mobile mobile-lg:max-w-mobile-lg mx-auto px-4">

// ✅ FULL-WIDTH: For navigation, lists, backgrounds
<div className="w-full">

// ❌ NEVER: Hard-coded pixel values
<div style={{ maxWidth: '375px' }}>
```

**Available mobile classes:**
- `max-w-mobile` (375px), `max-w-mobile-lg` (430px)
- `mobile:` (375px+), `mobile-lg:` (430px+) breakpoints
- `min-h-touch` (44px minimum for touch targets)
- `h-screen-safe` - Safe area adjusted viewport height

### Mobile Scrolling Patterns

```tsx
// ✅ CORRECT: Container scrolling
<div className="w-full h-dvh">
  <header className="flex-none p-4">Fixed header</header>
  <div className="flex-1 overflow-y-auto px-4">
    {/* Content scrolls internally - NOT the whole page */}
    {items.map(item => <div key={item.id}>{item.content}</div>)}
  </div>
</div>
```

## Mobile Development Standards

### Touch-First Component Development
- Functional components with mobile-optimized React Hooks
- 44px minimum touch targets for all interactive elements
- TypeScript interfaces designed for mobile data patterns
- Touch gesture support in all custom components

### Mobile-First Styling System
- Tailwind CSS with custom mobile utilities (`h-screen-safe`, `min-h-touch`, safe area spacing)
- Safe area support with built-in utilities for notched devices (`safe-top`, `safe-bottom`)
- Mobile-first responsive methodology (start 375px, scale up)
- CSS Grid and Flexbox optimized for mobile layouts
- Smooth animations via Framer Motion (performance-conscious)

### Mobile Performance Requirements
- React.memo and useMemo for mobile component optimization
- Code splitting and lazy loading for mobile network conditions
- WebP images and resource optimization for mobile bandwidth
- Service Worker support for offline mobile functionality

## Development Commands

- **Install dependencies**: `npm install`
- **Development server**: `npm run dev`
- **Build project**: `npm run build`
- **Preview build**: `npm run preview`

## ⚠️ CRITICAL: Vite + React Entry Point

**NEVER modify this line in `index.html`:**
```html
<script type="module" src="/src/main.tsx"></script>
```

**Work in `src/` directory instead** - modify `App.tsx`, add components, create pages.

## Mobile Deployment

- **Development server**: `http://127.0.0.1:5173`
- **Build output**: `dist/` directory (mobile-optimized)
- **HMR support**: Hot Module Replacement for mobile development
- **PWA ready**: Service Worker and manifest support included

## Configuration Files

- `vite.config.ts` - Mobile build optimizations
- `tailwind.config.js` - Mobile-first utilities
- `src/index.css` - Essential mobile touch optimizations
- `src/utils/mobileFeatures.ts` - 🚨 CRITICAL mobile device APIs
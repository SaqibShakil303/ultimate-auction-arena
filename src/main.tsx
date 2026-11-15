import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { TooltipProvider } from './components/shadcn/tooltip';
import { MotionConfig } from 'framer-motion';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={180}>
      <MotionConfig reducedMotion="user"><Suspense fallback={<div role="status" className="grid min-h-screen place-items-center bg-[#080e24] font-display text-xl text-white">Entering the arena…</div>}><App /></Suspense></MotionConfig>
    </TooltipProvider>
  </StrictMode>,
);

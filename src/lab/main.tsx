// Dev-only Personality Lab: experiment with how kinlings evolve through
// conversation, with every prompt and output visible (not part of the build).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LabApp } from './ui/LabApp';
import './lab.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LabApp />
  </StrictMode>,
);

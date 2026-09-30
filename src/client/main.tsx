import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initializeWindowIdentity } from './window-identity';

const root = document.getElementById('root');
if (!root) throw new Error('KANVAS root element is missing.');
void initializeWindowIdentity().then(()=>createRoot(root).render(<StrictMode><App /></StrictMode>));

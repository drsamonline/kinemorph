import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

const host = document.getElementById('root');
if (!host) throw new Error('missing #root');
createRoot(host).render(<ErrorBoundary>
        <App />
      </ErrorBoundary>);

import React from 'react';
import ReactDOM from 'react-dom/client';
import './fonts.css';
import './index.css';
import App from './App';
import { bootPlatform } from './platform/boot';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);

// Rendered once the platform has had its say, and whether or not it did:
// a boot that throws must still leave the player with a game.
bootPlatform()
    .catch((error) => console.warn('[boot]', error))
    .finally(() => {
        root.render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        );
    });

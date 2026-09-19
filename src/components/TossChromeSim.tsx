import React from 'react';
import { isSimulated, useChrome } from '../platform/chrome';

/**
 * Toss's two buttons, drawn where Toss would draw them.
 *
 * Only under `?tossSim=1`, and only in builds that allow it. The X sits where
 * the documentation says it does (right inset + 10, top inset + 5); the size
 * of the pair is a guess, and deliberately a generous one — the point is to
 * see at a glance whether anything of ours is under it.
 */
const TossChromeSim: React.FC = () => {
    const chrome = useChrome();
    if (!isSimulated()) return null;

    return (
        <>
            {/* Status bar and Dynamic Island. */}
            <div
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: chrome.top,
                    zIndex: 5000,
                    pointerEvents: 'none',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                <div style={{ width: 120, height: 32, borderRadius: 18, background: '#000' }} />
            </div>

            <div
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    top: chrome.top + 5,
                    right: chrome.right + 10,
                    zIndex: 5000,
                    pointerEvents: 'none',
                    display: 'flex',
                    height: 40,
                    borderRadius: 20,
                    background: 'rgba(0,0,0,0.55)',
                    border: '1px solid rgba(255,255,255,0.35)',
                    color: '#fff',
                    font: '600 18px/40px system-ui, sans-serif'
                }}
            >
                <span style={{ width: 48, textAlign: 'center' }}>···</span>
                <span style={{ width: 1, margin: '10px 0', background: 'rgba(255,255,255,0.35)' }} />
                <span style={{ width: 48, textAlign: 'center' }}>✕</span>
            </div>

            {/* Home indicator. */}
            <div
                aria-hidden="true"
                style={{
                    position: 'fixed',
                    left: '50%',
                    bottom: 8,
                    width: 134,
                    height: 5,
                    marginLeft: -67,
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.75)',
                    zIndex: 5000,
                    pointerEvents: 'none'
                }}
            />
        </>
    );
};

export default TossChromeSim;

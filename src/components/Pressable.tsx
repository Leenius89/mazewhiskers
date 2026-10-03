import React from 'react';
import { motion } from 'framer-motion';

const MotionDiv = motion.div as React.ElementType;

/**
 * A drawn button that a keyboard can use too.
 *
 * The panels draw their buttons as animated divs, which a mouse or a finger
 * can press and Tab cannot even reach. This one is focusable and answers
 * Enter and Space. The key stops here, so the screen underneath — the menu
 * starts a run on Space, the results screen retries on it — does not also act.
 */
const Pressable = ({ onClick, ...rest }: { onClick?: (event: unknown) => void; [prop: string]: unknown }) => (
    <MotionDiv
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event: React.KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            onClick?.(event);
        }}
        {...rest}
    />
);

export default Pressable;

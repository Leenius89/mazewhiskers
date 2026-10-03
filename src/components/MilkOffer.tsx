import React, { useState } from 'react';
import { Milk } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useAds } from '../platform/ads';
import { button, hint, theme } from './theme';
import Pressable from './Pressable';

interface MilkOfferProps {
    /** Shows the ad. Resolves true when it was watched through. */
    onWatch: () => Promise<boolean>;
}

const MotionButton = Pressable;

/**
 * The ad the player chooses: watch one, set out with a second carton of milk.
 *
 * Says plainly that it is an ad and what it pays, before anything is tapped.
 * Draws nothing at all when there is no ad to offer — an old Toss, a browser,
 * a slow network — so the results screen never carries a button that does
 * not work.
 */
const MilkOffer: React.FC<MilkOfferProps> = ({ onWatch }) => {
    const t = useTranslation();
    const { rewardedReady, bonusHeld } = useAds();
    const [busy, setBusy] = useState(false);

    if (bonusHeld) {
        return <p style={{ ...hint, color: theme.good, fontWeight: 600 }}>{t('ad.milk.held')}</p>;
    }

    if (!rewardedReady && !busy) return null;

    return (
        <MotionButton
            style={button('quiet', busy)}
            onClick={() => {
                if (busy) return;
                setBusy(true);
                void onWatch().then(() => setBusy(false));
            }}
            whileHover={{ y: -1 }}
            whileTap={{ y: 0 }}
        >
            <Milk size={13} />
            {t('ad.milk.offer')}
        </MotionButton>
    );
};

export default MilkOffer;

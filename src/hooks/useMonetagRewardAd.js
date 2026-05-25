import { useCallback, useEffect, useMemo, useState } from 'react';

function getExistingSdk(zoneId) {
  if (!zoneId) return null;
  return window[`show_${zoneId}`] || null;
}

export function useMonetagRewardAd({ zoneId, sdkSrc, userId, onReward, onError }) {
  const [loaded, setLoaded] = useState(() => Boolean(getExistingSdk(zoneId)));
  const sdkName = useMemo(() => (zoneId ? `show_${zoneId}` : ''), [zoneId]);

  useEffect(() => {
    if (!zoneId) {
      setLoaded(false);
      return undefined;
    }

    if (getExistingSdk(zoneId)) {
      setLoaded(true);
      return undefined;
    }

    if (!sdkSrc) {
      setLoaded(false);
      return undefined;
    }

    const existingScript = document.querySelector(`script[data-sdk="${sdkName}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => setLoaded(Boolean(getExistingSdk(zoneId))), { once: true });
      return undefined;
    }

    const script = document.createElement('script');
    script.src = sdkSrc;
    script.async = true;
    script.dataset.zone = zoneId;
    script.dataset.sdk = sdkName;
    script.onload = () => setLoaded(Boolean(getExistingSdk(zoneId)));
    script.onerror = () => {
      setLoaded(false);
      onError?.(new Error('Monetag SDK failed to load'));
    };
    document.head.appendChild(script);

    return undefined;
  }, [onError, sdkName, sdkSrc, zoneId]);

  const showAd = useCallback(async () => {
    const show = getExistingSdk(zoneId);

    if (!show) {
      onError?.(new Error(zoneId ? 'Monetag ad is not ready yet' : 'Missing Monetag zone id'));
      return;
    }

    try {
      const result = await show({
        type: 'end',
        ymid: String(userId || 'demo-user'),
        requestVar: 'reward_button',
        catchIfNoFeed: true,
      });

      if (!result?.reward_event_type || result.reward_event_type === 'valued') {
        onReward?.(result);
        return;
      }

      onError?.(new Error('Ad completed but Monetag marked it non-valued'));
    } catch (error) {
      onError?.(error);
    }
  }, [onError, onReward, userId, zoneId]);

  return { loaded, showAd };
}

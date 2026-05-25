import { useCallback, useEffect, useRef } from 'react';

export function useAdsgram({ blockId, onReward, onError }) {
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!blockId || !window.Adsgram?.init) {
      controllerRef.current = null;
      return;
    }

    controllerRef.current = window.Adsgram.init({ blockId });
  }, [blockId]);

  return useCallback(async () => {
    if (!controllerRef.current) {
      onError?.({
        error: true,
        done: false,
        state: 'load',
        description: blockId ? 'AdsGram script not loaded yet' : 'Missing AdsGram block id',
      });
      return;
    }

    try {
      await controllerRef.current.show();
      onReward?.();
    } catch (result) {
      onError?.(result);
    }
  }, [blockId, onError, onReward]);
}

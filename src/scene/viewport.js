export function renderProfile(width,pixelRatio,coarsePointer){
  const compact=width<768||coarsePointer;
  const cappedRatio=Math.min(pixelRatio,2);
  return {
    compact,pixelRatio:Math.min(cappedRatio,compact?1.25:1.5),
    ringParticles:compact?32000:96000,rocks:compact?480:1800,
    stars:compact?4500:11500,dust:compact?1400:4000,
    distantStars:compact?3500:9000,warpStreaks:compact?1400:3000,
  };
}

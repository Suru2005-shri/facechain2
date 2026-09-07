# Video background verification

The supplied `/manus-storage/1000051128_8f046132.mp4` asset is integrated through the existing `AmbientVideo` component for both landing and workspace variants. The desktop preview showed the video layer behind the hero, metric cards, and trust-boundary content while the existing dark overlays preserved text contrast. The mobile preview showed the video visibly filling the background behind the stacked workspace cards and bottom navigation without clipping or horizontal overflow.

The existing component retains `autoPlay`, `loop`, `muted`, `playsInline`, poster fallback, and the `motion-reduce:hidden` behavior for reduced-motion users.

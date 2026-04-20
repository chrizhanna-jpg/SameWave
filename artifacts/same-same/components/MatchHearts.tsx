import React from "react";
import Svg, { Path } from "react-native-svg";

type Props = {
  size?: number;
  color?: string;
};

// Two clearly-distinct hearts side-by-side with a slight overlap, so the
// "two of the same" / "match" idea reads instantly even at small sizes.
const HEART =
  "M12 21 C4 14 1 9 4 5 C7 1 11 3 12 7 C13 3 17 1 20 5 C23 9 20 14 12 21 Z";

export function MatchHearts({ size = 28, color = "#001018" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 24" fill="none">
      {/* Back heart — slightly behind & to the right, drawn first */}
      <Path
        d={HEART}
        fill={color}
        opacity={0.35}
        transform="translate(15 0)"
      />
      {/* Front heart — fully opaque, on the left */}
      <Path
        d={HEART}
        fill={color}
        transform="translate(3 0)"
      />
    </Svg>
  );
}

export default MatchHearts;

import Svg, { Path, Rect } from 'react-native-svg';

export function AnguloIcon({ size = 24, color = '#000' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="1"
        stroke={color}
        strokeWidth="2"
      />
      <Path
        d="M8 10H16M8 14H16"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

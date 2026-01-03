import Svg, { Path } from 'react-native-svg';

export function LuzIcon({ size = 24, color = '#000' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2V4M12 20V22M4 12H2M6.31 6.31L4.89 4.89M17.69 6.31L19.11 4.89M6.31 17.69L4.89 19.11M17.69 17.69L19.11 19.11M22 12H20M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

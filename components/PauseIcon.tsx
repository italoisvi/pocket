import Svg, { Rect } from 'react-native-svg';

type PauseIconProps = {
  size?: number;
  color?: string;
};

export function PauseIcon({ size = 24, color = '#000' }: PauseIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="4" width="4" height="16" rx="1" fill={color} />
      <Rect x="14" y="4" width="4" height="16" rx="1" fill={color} />
    </Svg>
  );
}

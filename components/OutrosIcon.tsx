import Svg, { Circle } from 'react-native-svg';

type OutrosIconProps = {
  size?: number;
  color?: string;
};

export function OutrosIcon({ size = 24, color = '#000' }: OutrosIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx="2" cy="12" r="2" />
      <Circle cx="12" cy="12" r="2" />
      <Circle cx="22" cy="12" r="2" />
    </Svg>
  );
}

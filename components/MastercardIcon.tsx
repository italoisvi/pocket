import Svg, { Circle, Rect } from 'react-native-svg';

type MastercardIconProps = {
  size?: number;
};

export function MastercardIcon({ size = 40 }: MastercardIconProps) {
  const height = size * 0.625;
  return (
    <Svg width={size} height={height} viewBox="0 0 64 40">
      <Rect width="64" height="40" rx="4" fill="#000" />
      <Circle cx="24" cy="20" r="11" fill="#EB001B" />
      <Circle cx="40" cy="20" r="11" fill="#F79E1B" />
      <Circle cx="32" cy="20" r="11" fill="#FF5F00" opacity="0.7" />
    </Svg>
  );
}

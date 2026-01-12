import Svg, { Path } from 'react-native-svg';

type PlayIconProps = {
  size?: number;
  color?: string;
};

export function PlayIcon({ size = 24, color = '#000' }: PlayIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 5.14v14.72a1 1 0 001.5.86l11-7.36a1 1 0 000-1.72l-11-7.36a1 1 0 00-1.5.86z"
        fill={color}
      />
    </Svg>
  );
}

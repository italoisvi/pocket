import Svg, { Path } from 'react-native-svg';

type MaisIconProps = {
  size?: number;
  color?: string;
};

export function MaisIcon({ size = 24, color = '#000' }: MaisIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M24,12c0,.276-.224,.5-.5,.5H12.5v11c0,.276-.224,.5-.5,.5s-.5-.224-.5-.5V12.5H.5c-.276,0-.5-.224-.5-.5s.224-.5,.5-.5H11.5V.5c0-.276,.224-.5,.5-.5s.5,.224,.5,.5V11.5h11c.276,0,.5,.224,.5,.5Z"
        fill={color}
      />
    </Svg>
  );
}

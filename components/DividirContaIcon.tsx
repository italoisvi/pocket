import Svg, { Path } from 'react-native-svg';

type DividirContaIconProps = {
  size?: number;
  color?: string;
};

export function DividirContaIcon({
  size = 24,
  color = '#000',
}: DividirContaIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m24,12c0,.276-.224.5-.5.5H.5c-.276,0-.5-.224-.5-.5s.224-.5.5-.5h23c.276,0,.5.224.5.5Zm-13.5-7c0,.827.673,1.5,1.5,1.5s1.5-.673,1.5-1.5-.673-1.5-1.5-1.5-1.5.673-1.5,1.5Zm3,14c0-.827-.673-1.5-1.5-1.5s-1.5.673-1.5,1.5.673,1.5,1.5,1.5,1.5-.673,1.5-1.5Z"
        fill={color}
      />
    </Svg>
  );
}

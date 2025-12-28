import Svg, { Path } from 'react-native-svg';

type DividirContaIconFilledProps = {
  size?: number;
  color?: string;
};

export function DividirContaIconFilled({
  size = 24,
  color = '#000',
}: DividirContaIconFilledProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m24,12c0,.829-.672,1.5-1.5,1.5H1.5c-.829,0-1.5-.671-1.5-1.5s.671-1.5,1.5-1.5h21c.828,0,1.5.671,1.5,1.5Zm-12-5c1.381,0,2.5-1.119,2.5-2.5s-1.119-2.5-2.5-2.5-2.5,1.119-2.5,2.5,1.119,2.5,2.5,2.5Zm0,10c-1.381,0-2.5,1.119-2.5,2.5s1.119,2.5,2.5,2.5,2.5-1.119,2.5-2.5-1.119-2.5-2.5-2.5Z"
        fill={color}
      />
    </Svg>
  );
}

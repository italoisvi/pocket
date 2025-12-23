import Svg, { Path } from 'react-native-svg';

type ChevronLeftIconProps = {
  size?: number;
  color?: string;
};

export function ChevronLeftIcon({
  size = 24,
  color = '#000',
}: ChevronLeftIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m7,12c0-.935.364-1.813,1.025-2.475l9.291-9.377c.098-.099.227-.148.355-.148.127,0,.255.048.352.145.196.194.198.511.004.707l-9.293,9.379c-.475.475-.734,1.103-.734,1.77s.26,1.295.732,1.768l9.295,9.379c.194.196.192.513-.004.707-.195.195-.513.191-.707-.004l-9.293-9.379c-.659-.659-1.023-1.538-1.023-2.473Z"
        fill={color}
      />
    </Svg>
  );
}

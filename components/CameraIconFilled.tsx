import Svg, { Path, Circle } from 'react-native-svg';

type CameraIconFilledProps = {
  size?: number;
  color?: string;
};

export function CameraIconFilled({
  size = 24,
  color = '#000',
}: CameraIconFilledProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.721,3,16.308,1.168A3.023,3.023,0,0,0,13.932,0H10.068A3.023,3.023,0,0,0,7.692,1.168L6.279,3Z"
        fill={color}
      />
      <Circle cx="12" cy="14" r="4" fill={color} />
      <Path
        d="M19,5H5a5.006,5.006,0,0,0-5,5v9a5.006,5.006,0,0,0,5,5H19a5.006,5.006,0,0,0,5-5V10A5.006,5.006,0,0,0,19,5ZM12,20a6,6,0,1,1,6-6A6.006,6.006,0,0,1,12,20Z"
        fill={color}
      />
    </Svg>
  );
}

import Svg, { Rect } from 'react-native-svg';

type StopIconProps = {
  size?: number;
  color?: string;
};

export function StopIcon({ size = 24, color = '#000' }: StopIconProps) {
  // Using the same proportions as the original stop.svg (rounded corners)
  // Original: 512x512 with corner radius ~106.667 (about 21% of size)
  const cornerRadius = size * 0.21;
  const padding = size * 0.1;
  const rectSize = size - padding * 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <Rect
        x={padding}
        y={padding}
        width={rectSize}
        height={rectSize}
        rx={cornerRadius}
        ry={cornerRadius}
        fill={color}
      />
    </Svg>
  );
}

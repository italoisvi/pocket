import Svg, { Path } from 'react-native-svg';

type PetsIconProps = {
  size?: number;
  color?: string;
};

export function PetsIcon({ size = 24, color = '#FFB74D' }: PetsIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Paw print icon */}
      <Path
        d="M12 10.5c1.5 0 2.5 1.5 2.5 3.5 0 2.5-1.5 4-2.5 4s-2.5-1.5-2.5-4c0-2 1-3.5 2.5-3.5z"
        fill={color}
      />
      <Path
        d="M7.5 9c1.1 0 2 1.1 2 2.5S8.6 14 7.5 14 5.5 12.9 5.5 11.5 6.4 9 7.5 9z"
        fill={color}
      />
      <Path
        d="M16.5 9c1.1 0 2 1.1 2 2.5s-.9 2.5-2 2.5-2-1.1-2-2.5.9-2.5 2-2.5z"
        fill={color}
      />
      <Path
        d="M5 6c.8 0 1.5.9 1.5 2S5.8 10 5 10s-1.5-.9-1.5-2S4.2 6 5 6z"
        fill={color}
      />
      <Path
        d="M19 6c.8 0 1.5.9 1.5 2s-.7 2-1.5 2-1.5-.9-1.5-2 .7-2 1.5-2z"
        fill={color}
      />
    </Svg>
  );
}

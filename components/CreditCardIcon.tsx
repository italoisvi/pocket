import Svg, { Path, Rect } from 'react-native-svg';

type CreditCardIconProps = {
  size?: number;
  color?: string;
};

export function CreditCardIcon({
  size = 40,
  color = '#6B7280',
}: CreditCardIconProps) {
  return (
    <Svg width={size} height={size * 0.625} viewBox="0 0 64 40">
      <Rect width="64" height="40" rx="4" fill={color} />
      <Rect
        x="8"
        y="8"
        width="48"
        height="6"
        rx="1"
        fill="#fff"
        opacity="0.3"
      />
      <Rect
        x="8"
        y="20"
        width="20"
        height="4"
        rx="1"
        fill="#fff"
        opacity="0.8"
      />
      <Rect
        x="8"
        y="26"
        width="15"
        height="4"
        rx="1"
        fill="#fff"
        opacity="0.8"
      />
      <Rect
        x="35"
        y="20"
        width="21"
        height="10"
        rx="2"
        fill="#fff"
        opacity="0.2"
      />
    </Svg>
  );
}

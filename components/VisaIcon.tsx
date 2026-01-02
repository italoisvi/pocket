import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

type VisaIconProps = {
  size?: number;
};

export function VisaIcon({ size = 40 }: VisaIconProps) {
  const height = size * 0.625;
  return (
    <Svg width={size} height={height} viewBox="0 0 64 40">
      <Rect width="64" height="40" rx="4" fill="#1A1F71" />
      <SvgText
        x="32"
        y="25"
        fill="#fff"
        fontSize="16"
        fontWeight="bold"
        textAnchor="middle"
        fontFamily="Arial"
      >
        VISA
      </SvgText>
    </Svg>
  );
}

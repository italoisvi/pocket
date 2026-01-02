import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

type EloIconProps = {
  size?: number;
};

export function EloIcon({ size = 40 }: EloIconProps) {
  const height = size * 0.625;
  return (
    <Svg width={size} height={height} viewBox="0 0 64 40">
      <Rect width="64" height="40" rx="4" fill="#000" />
      <SvgText
        x="32"
        y="25"
        fill="#FFCB05"
        fontSize="18"
        fontWeight="bold"
        textAnchor="middle"
        fontFamily="Arial"
      >
        ELO
      </SvgText>
    </Svg>
  );
}

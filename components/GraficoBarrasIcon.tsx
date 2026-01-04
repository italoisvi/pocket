import Svg, { Path } from 'react-native-svg';

type GraficoBarrasIconProps = {
  size?: number;
  color?: string;
};

export function GraficoBarrasIcon({
  size = 24,
  color = '#000',
}: GraficoBarrasIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12,0c-1.65,0-3,1.35-3,3V21c0,1.65,1.35,3,3,3s3-1.35,3-3V3c0-1.65-1.35-3-3-3Zm2,21c0,1.1-.9,2-2,2s-2-.9-2-2V3c0-1.1,.9-2,2-2s2,.9,2,2V21Zm7-15c-1.65,0-3,1.35-3,3v12c0,1.65,1.35,3,3,3s3-1.35,3-3V9c0-1.65-1.35-3-3-3Zm2,15c0,1.1-.9,2-2,2s-2-.9-2-2V9c0-1.1,.9-2,2-2s2,.9,2,2v12ZM3,12c-1.65,0-3,1.35-3,3v6c0,1.65,1.35,3,3,3s3-1.35,3-3v-6c0-1.65-1.35-3-3-3Zm2,9c0,1.1-.9,2-2,2s-2-.9-2-2v-6c0-1.1,.9-2,2-2s2,.9,2,2v6Z"
        fill={color}
      />
    </Svg>
  );
}

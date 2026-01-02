import Svg, { Path } from 'react-native-svg';

type AlertaIconProps = {
  size?: number;
  color?: string;
};

export function AlertaIcon({ size = 24, color = '#000' }: AlertaIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12,0C5.383,0,0,5.383,0,12s5.383,12,12,12,12-5.383,12-12S18.617,0,12,0Zm0,23c-6.065,0-11-4.935-11-11S5.935,1,12,1s11,4.935,11,11-4.935,11-11,11Zm0-6c-.552,0-1,.448-1,1s.448,1,1,1,1-.448,1-1-.448-1-1-1Zm0-11c-.552,0-1,.448-1,1v8c0,.552,.448,1,1,1s1-.448,1-1V7c0-.552-.448-1-1-1Z"
        fill={color}
      />
    </Svg>
  );
}

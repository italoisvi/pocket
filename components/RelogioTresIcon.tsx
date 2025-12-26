import Svg, { Path } from 'react-native-svg';

type RelogioTresIconProps = {
  size?: number;
  color?: string;
};

export function RelogioTresIcon({
  size = 24,
  color = '#000',
}: RelogioTresIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12,24C5.383,24,0,18.617,0,12S5.383,0,12,0s12,5.383,12,12-5.383,12-12,12ZM12,1C5.935,1,1,5.935,1,12s4.935,11,11,11,11-4.935,11-11S18.065,1,12,1Zm5,11.5c0-.276-.224-.5-.5-.5h-4.5V5.5c0-.276-.224-.5-.5-.5s-.5,.224-.5,.5v7c0,.276,.224,.5,.5,.5h5c.276,0,.5-.224,.5-.5Z"
        fill={color}
      />
    </Svg>
  );
}

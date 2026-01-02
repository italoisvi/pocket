import Svg, { Path } from 'react-native-svg';

type SetaParaCimaIconProps = {
  size?: number;
  color?: string;
};

export function SetaParaCimaIcon({
  size = 24,
  color = '#f87171',
}: SetaParaCimaIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m17.814,5.392c-.098.101-.228.151-.357.151-.126,0-.252-.047-.35-.142l-4.043-3.948c-.165-.167-.358-.288-.564-.362v22.409c0,.276-.224.5-.5.5s-.5-.224-.5-.5V1.083c-.205.071-.398.187-.563.35l-4.091,3.928c-.199.19-.517.187-.707-.015-.191-.199-.186-.516.014-.707L10.239.716c.473-.466,1.123-.716,1.761-.716.624.016,1.297.265,1.77.744l4.037,3.941c.197.193.201.51.008.707Z"
        fill={color}
      />
    </Svg>
  );
}
